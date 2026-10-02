import json
import os
import tempfile
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import matplotlib.animation as animation

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ── Data Structures ──────────────────────────────────────────────────────────

match_info = {}
frames = []  # list of raw dicts from JSONL
player_lookup = {}  # trackable_object -> player info dict
home_team_id = None
away_team_id = None
home_team_name = ""
away_team_name = ""
home_jersey_color = "#001536"
away_jersey_color = "#ffffff"
home_number_color = "#FFFFFF"
away_number_color = "#000000"
pitch_length = 105
pitch_width = 68


def load_data():
    global match_info, frames, player_lookup
    global home_team_id, away_team_id, home_team_name, away_team_name
    global home_jersey_color, away_jersey_color, home_number_color, away_number_color
    global pitch_length, pitch_width

    # ── Load match metadata ──
    match_path = os.path.join(BASE_DIR, "data", "2017461_match.json")
    print(f"Loading match metadata from {match_path}...")
    with open(match_path, "r") as f:
        match_info = json.load(f)

    home_team_id = match_info["home_team"]["id"]
    away_team_id = match_info["away_team"]["id"]
    home_team_name = match_info["home_team"]["short_name"]
    away_team_name = match_info["away_team"]["short_name"]
    home_kit = match_info.get("home_team_kit") or {}
    away_kit = match_info.get("away_team_kit") or {}
    home_jersey_color = home_kit.get("jersey_color", "#001536")
    away_jersey_color = away_kit.get("jersey_color", "#ffffff")
    home_number_color = home_kit.get("number_color", "#FFFFFF")
    away_number_color = away_kit.get("number_color", "#000000")
    pitch_length = match_info.get("pitch_length", 105)
    pitch_width = match_info.get("pitch_width", 68)

    # Tracking frames identify players by `id`, not `trackable_object`.
    for p in match_info.get("players", []):
        role = p.get("player_role") or {}
        info = {
            "name": p.get("short_name", ""),
            "number": p.get("number"),
            "team_id": p.get("team_id"),
            "position": role.get("acronym", ""),
        }
        pid = p.get("id")
        if pid is not None:
            player_lookup[pid] = info
        trackable = p.get("trackable_object")
        if trackable is not None and trackable not in player_lookup:
            player_lookup[trackable] = info

    print(f"  Match: {home_team_name} vs {away_team_name}")
    print(f"  Pitch: {pitch_length}m x {pitch_width}m")
    print(f"  Players indexed: {len(player_lookup)}")

    # ── Load tracking data (raw JSONL) ──
    tracking_path = os.path.join(BASE_DIR, "data", "2017461_tracking_extrapolated.jsonl")
    print(f"Loading tracking data from {tracking_path}...")
    with open(tracking_path, "r") as f:
        for line in f:
            frames.append(json.loads(line))

    print(f"  Total frames loaded: {len(frames)}")
    # Find actual match frames (period != null)
    match_frames = [i for i, fr in enumerate(frames) if fr.get("period") is not None]
    if match_frames:
        print(f"  Match frames: {match_frames[0]} to {match_frames[-1]}")


load_data()


# ── Helper: classify player as home/away ──────────────────────────────────────

def classify_player(player_id):
    """Returns 'home', 'away', or 'unknown' based on trackable_object."""
    info = player_lookup.get(player_id)
    if info is None:
        return "unknown"
    if info["team_id"] == home_team_id:
        return "home"
    elif info["team_id"] == away_team_id:
        return "away"
    return "unknown"


# ── Lineups ───────────────────────────────────────────────────────────────────

DEF_ORDER = ["LWB", "LB", "LCB", "CB", "SW", "RCB", "RB", "RWB"]
MID_ORDER = ["LDM", "CDM", "DM", "RDM", "LM", "CM", "RM", "LAM", "CAM", "RAM", "AM"]
ATT_ORDER = ["LW", "LF", "SS", "CF", "ST", "RF", "RW"]


def clock_to_minute(clock):
    """Match clock 'HH:MM:SS' from kickoff → whole minute, or None."""
    if not clock:
        return None
    parts = str(clock).split(":")
    if len(parts) != 3:
        return None
    try:
        hours, minutes, seconds = (int(part) for part in parts)
    except ValueError:
        return None
    return (hours * 3600 + minutes * 60 + seconds) // 60


def lineup_row(acronym, group):
    group = group or ""
    if acronym == "GK" or "Goalkeeper" in group:
        return "gk"
    if acronym in DEF_ORDER or "Defend" in group or group.endswith("Back"):
        return "def"
    if acronym in ATT_ORDER or "Attack" in group or "Forward" in group or "Wing" in group:
        return "att"
    return "mid"


def formation_of(starters):
    counts = {"def": 0, "mid": 0, "att": 0}
    for player in starters:
        row = player["row"]
        if row in counts:
            counts[row] += 1
    if not any(counts.values()):
        return ""
    return f"{counts['def']}-{counts['mid']}-{counts['att']}"


def serialize_player(player):
    role = player.get("player_role") or {}
    acronym = role.get("acronym") or ""
    group = role.get("position_group") or ""
    minutes = None
    playing = (player.get("playing_time") or {}).get("total") or {}
    if playing.get("minutes_played") is not None:
        minutes = round(playing["minutes_played"], 1)
    start_time = player.get("start_time")
    return {
        "id": player.get("id"),
        "name": player.get("short_name") or "",
        "full_name": " ".join(
            part.strip()
            for part in (player.get("first_name") or "", player.get("last_name") or "")
            if part and part.strip()
        ),
        "number": player.get("number"),
        "position": role.get("name") or "",
        "position_group": group,
        "acronym": acronym,
        "row": lineup_row(acronym, group),
        "starter": start_time == "00:00:00",
        "start_time": start_time,
        "end_time": player.get("end_time"),
        "subbed_on": clock_to_minute(start_time) if start_time and start_time != "00:00:00" else None,
        "subbed_off": clock_to_minute(player.get("end_time")),
        "goals": player.get("goal") or 0,
        "own_goals": player.get("own_goal") or 0,
        "yellow_cards": player.get("yellow_card") or 0,
        "red_cards": player.get("red_card") or 0,
        "injured": bool(player.get("injured")),
        "minutes": minutes,
    }


def build_team_lineup(team_id, team_name, jersey_color, number_color):
    squad = [
        serialize_player(player)
        for player in match_info.get("players", [])
        if player.get("team_id") == team_id
    ]
    starters = [player for player in squad if player["starter"]]
    substitutes = [player for player in squad if not player["starter"]]
    row_order = {"gk": 0, "def": 1, "mid": 2, "att": 3}
    catalog = {acronym: index for index, acronym in enumerate(DEF_ORDER + MID_ORDER + ATT_ORDER + ["GK"])}

    def sort_key(player):
        return (row_order.get(player["row"], 9), catalog.get(player["acronym"], 99), player["number"] or 0)

    starters.sort(key=sort_key)
    substitutes.sort(key=lambda player: (player["subbed_on"] is None, player["subbed_on"] or 0, player["number"] or 0))
    return {
        "id": team_id,
        "name": team_name,
        "jersey_color": jersey_color,
        "number_color": number_color,
        "formation": formation_of(starters),
        "starters": starters,
        "substitutes": substitutes,
    }


def match_payload():
    stadium = match_info.get("stadium") or {}
    edition = match_info.get("competition_edition") or {}
    competition = edition.get("competition") or {}
    rnd = match_info.get("competition_round") or {}
    return {
        "home_team": home_team_name,
        "away_team": away_team_name,
        "home_team_full": (match_info.get("home_team") or {}).get("name", home_team_name),
        "away_team_full": (match_info.get("away_team") or {}).get("name", away_team_name),
        "home_score": match_info.get("home_team_score"),
        "away_score": match_info.get("away_team_score"),
        "home_jersey_color": home_jersey_color,
        "away_jersey_color": away_jersey_color,
        "home_number_color": home_number_color,
        "away_number_color": away_number_color,
        "pitch_length": pitch_length,
        "pitch_width": pitch_width,
        "date_time": match_info.get("date_time"),
        "status": match_info.get("status"),
        "stadium": stadium.get("name"),
        "city": stadium.get("city"),
        "competition": competition.get("name") or edition.get("name"),
        "season": (edition.get("season") or {}).get("name"),
        "round": rnd.get("name"),
    }


# ── REST Endpoints ────────────────────────────────────────────────────────────

@app.get("/")
def read_root():
    periods = match_info.get("match_periods", [])
    return {
        "status": "ok",
        "total_frames": len(frames),
        "match": match_payload(),
        "periods": periods,
        "lineups": {
            "home": build_team_lineup(home_team_id, home_team_name, home_jersey_color, home_number_color),
            "away": build_team_lineup(away_team_id, away_team_name, away_jersey_color, away_number_color),
        },
    }


@app.get("/frames")
def get_frames(start: int = 0, end: int = 100):
    """Return a batch of frames efficiently for the frontend to buffer."""
    start = max(0, start)
    end = min(len(frames), end)
    result = []
    for fr in frames[start:end]:
        home_players = []
        away_players = []
        for pd in fr.get("player_data", []):
            info = player_lookup.get(pd["player_id"], {})
            team = classify_player(pd["player_id"])
            entry = {
                "x": pd["x"],
                "y": pd["y"],
                "id": pd["player_id"],
                "number": info.get("number"),
                "name": info.get("name", ""),
                "detected": pd.get("is_detected", True),
            }
            if team == "home":
                home_players.append(entry)
            else:
                away_players.append(entry)

        ball = fr.get("ball_data", {})
        result.append({
            "frame": fr["frame"],
            "timestamp": fr.get("timestamp"),
            "period": fr.get("period"),
            "ball": {
                "x": ball.get("x"),
                "y": ball.get("y"),
                "z": ball.get("z"),
                "detected": ball.get("is_detected"),
            },
            "possession": fr.get("possession", {}),
            "home": home_players,
            "away": away_players,
        })
    return result


# ── GIF Clip Generation ──────────────────────────────────────────────────────

class ClipRequest(BaseModel):
    start_frame: int
    end_frame: int

@app.post("/clip")
async def generate_clip(req: ClipRequest):
    s = max(0, req.start_frame)
    e = min(len(frames), req.end_frame)
    if s >= e:
        raise HTTPException(400, "start_frame must be less than end_frame")
    if e - s > 300:
        raise HTTPException(400, "Max 300 frames (30s at 10fps)")

    clip = frames[s:e]
    half_l = pitch_length / 2
    half_w = pitch_width / 2

    fig, ax = plt.subplots(figsize=(10.5, 6.8))
    fig.patch.set_facecolor('#1a1a2e')

    def draw_pitch(ax):
        ax.set_facecolor('#2d6a4f')
        ax.set_xlim(-half_l - 3, half_l + 3)
        ax.set_ylim(-half_w - 3, half_w + 3)
        ax.set_aspect('equal')
        ax.set_xticks([])
        ax.set_yticks([])
        # Pitch outline
        ax.plot([-half_l, half_l, half_l, -half_l, -half_l],
                [-half_w, -half_w, half_w, half_w, -half_w], color='white', lw=1.5)
        # Center line
        ax.plot([0, 0], [-half_w, half_w], color='white', lw=1.5)
        # Center circle
        cc = plt.Circle((0, 0), 9.15, color='white', fill=False, lw=1.5)
        ax.add_patch(cc)
        ax.plot(0, 0, 'o', color='white', ms=3)
        # Penalty areas (approx)
        for sign in [-1, 1]:
            ax.add_patch(patches.Rectangle(
                (sign * half_l - (16.5 if sign == 1 else 0), -20.16),
                16.5, 40.32, fill=False, edgecolor='white', lw=1.5
            ))

    draw_pitch(ax)

    scat_home = ax.scatter([], [], c=home_jersey_color, s=80, edgecolors='white', lw=0.8, zorder=5)
    scat_away = ax.scatter([], [], c=away_jersey_color, s=80, edgecolors='black', lw=0.8, zorder=5)
    scat_ball = ax.scatter([], [], c='#ffff00', s=40, edgecolors='black', lw=1, zorder=10)
    title_text = ax.set_title("", color='white', fontsize=10, pad=8)

    def update(i):
        fr = clip[i]
        hc, ac = [], []
        for pd in fr.get("player_data", []):
            team = classify_player(pd["player_id"])
            if team == "home":
                hc.append([pd["x"], pd["y"]])
            else:
                ac.append([pd["x"], pd["y"]])

        scat_home.set_offsets(hc if hc else [[-999, -999]])
        scat_away.set_offsets(ac if ac else [[-999, -999]])

        bd = fr.get("ball_data", {})
        if bd.get("x") is not None:
            scat_ball.set_offsets([[bd["x"], bd["y"]]])
        else:
            scat_ball.set_offsets([[-999, -999]])

        ts = fr.get("timestamp", "")
        p = fr.get("period", "")
        title_text.set_text(f"{home_team_name} vs {away_team_name}  |  Period {p}  |  {ts}")
        return scat_home, scat_away, scat_ball, title_text

    ani = animation.FuncAnimation(fig, update, frames=len(clip), interval=100, blit=True)

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".gif")
    tmp.close()
    ani.save(tmp.name, writer="pillow", fps=10)
    plt.close(fig)

    return FileResponse(tmp.name, media_type="image/gif",
                        filename=f"clip_{s}_{e}.gif")


# ── WebSocket for real-time scrubbing ─────────────────────────────────────────

@app.websocket("/ws/match")
async def ws_match(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = json.loads(await websocket.receive_text())
            idx = data.get("frame_idx", 0)
            idx = max(0, min(idx, len(frames) - 1))

            fr = frames[idx]
            home_players = []
            away_players = []
            for pd in fr.get("player_data", []):
                info = player_lookup.get(pd["player_id"], {})
                team = classify_player(pd["player_id"])
                entry = {
                    "x": pd["x"], "y": pd["y"],
                    "id": pd["player_id"],
                    "number": info.get("number"),
                    "name": info.get("name", ""),
                    "detected": pd.get("is_detected", True),
                }
                if team == "home":
                    home_players.append(entry)
                else:
                    away_players.append(entry)

            ball = fr.get("ball_data", {})
            await websocket.send_json({
                "frame": fr["frame"],
                "timestamp": fr.get("timestamp"),
                "period": fr.get("period"),
                "ball": {
                    "x": ball.get("x"), "y": ball.get("y"),
                    "z": ball.get("z"), "detected": ball.get("is_detected"),
                },
                "possession": fr.get("possession", {}),
                "home": home_players,
                "away": away_players,
            })
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"WS error: {e}")
