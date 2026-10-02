function Events({ player }) {
  return (
    <span className="events">
      {player.goals > 0 && (
        <span className="evt goal" title="Goal">
          ⚽{player.goals > 1 ? player.goals : ''}
        </span>
      )}
      {player.own_goals > 0 && (
        <span className="evt own-goal" title="Own goal">
          OG
        </span>
      )}
      {player.yellow_cards > 0 && <span className="evt card yellow" title="Yellow card" />}
      {player.red_cards > 0 && <span className="evt card red" title="Red card" />}
      {player.subbed_on != null && (
        <span className="evt sub on" title="Substituted on">↑ {player.subbed_on}&apos;</span>
      )}
      {player.subbed_off != null && (
        <span className="evt sub off" title="Substituted off">↓ {player.subbed_off}&apos;</span>
      )}
      {player.injured && <span className="evt injured" title="Injured">+</span>}
    </span>
  )
}

function Shirt({ player, kit, ink }) {
  return (
    <span className="shirt" style={{ background: kit, color: ink }}>
      {player.number}
    </span>
  )
}

function PlayerRow({ player, kit, ink }) {
  return (
    <div className="player-row">
      <Shirt player={player} kit={kit} ink={ink} />
      <div className="player-id">
        <span className="player-name">{player.name}</span>
        <span className="player-pos">{player.position || player.acronym}</span>
      </div>
      <Events player={player} />
      {player.minutes != null && <span className="minutes">{player.minutes}&apos;</span>}
    </div>
  )
}

function placeOnPitch(starters) {
  const rows = { gk: [], def: [], mid: [], att: [] }
  starters.forEach(player => {
    const row = rows[player.row] ? player.row : 'mid'
    rows[row].push(player)
  })
  const x = { gk: 10, def: 28, mid: 50, att: 74 }
  const placed = []
  for (const row of ['gk', 'def', 'mid', 'att']) {
    const list = rows[row]
    list.forEach((player, index) => {
      const y = list.length === 1 ? 50 : 14 + (index * (72 / (list.length - 1)))
      placed.push({ ...player, x: x[row], y })
    })
  }
  return placed
}

function FormationPitch({ team }) {
  const players = placeOnPitch(team.starters || [])
  return (
    <div className="formation-pitch" aria-label={`${team.name} formation`}>
      <div className="formation-lines" />
      {players.map(player => (
        <div
          key={player.id}
          className="pitch-player"
          style={{ left: `${player.x}%`, top: `${player.y}%` }}
        >
          <span
            className="pitch-shirt"
            style={{ background: team.jersey_color, color: team.number_color }}
          >
            {player.number}
          </span>
          <span className="pitch-name">{player.name}</span>
        </div>
      ))}
    </div>
  )
}

function TeamColumn({ team }) {
  const used = (team.substitutes || []).filter(player => player.subbed_on != null)
  const unused = (team.substitutes || []).filter(player => player.subbed_on == null)
  return (
    <section className="team-column">
      <header className="team-head">
        <span className="kit-swatch" style={{ background: team.jersey_color }} />
        <div>
          <h2>{team.name}</h2>
          <p className="formation">{team.formation || '—'}</p>
        </div>
      </header>

      <FormationPitch team={team} />

      <h3>Starting XI</h3>
      <div className="player-list">
        {(team.starters || []).map(player => (
          <PlayerRow
            key={player.id}
            player={player}
            kit={team.jersey_color}
            ink={team.number_color}
          />
        ))}
      </div>

      <h3>Substitutes</h3>
      <div className="player-list">
        {used.map(player => (
          <PlayerRow
            key={player.id}
            player={player}
            kit={team.jersey_color}
            ink={team.number_color}
          />
        ))}
        {unused.length > 0 && <p className="bench-label">Unused substitutes</p>}
        {unused.map(player => (
          <PlayerRow
            key={player.id}
            player={player}
            kit={team.jersey_color}
            ink={team.number_color}
          />
        ))}
        {used.length === 0 && unused.length === 0 && (
          <p className="empty-note">No substitutes listed</p>
        )}
      </div>
    </section>
  )
}

function formatKickoff(iso) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function Lineups({ match, lineups }) {
  if (!match || !lineups) {
    return <div className="lineups-empty">Lineups will appear once the match data loads.</div>
  }

  const info = [
    { label: 'Competition', value: [match.competition, match.season].filter(Boolean).join(' · ') },
    { label: 'Round', value: match.round },
    { label: 'Kickoff', value: formatKickoff(match.date_time) },
    { label: 'Stadium', value: [match.stadium, match.city].filter(Boolean).join(', ') },
    { label: 'Status', value: match.status ? match.status[0].toUpperCase() + match.status.slice(1) : null },
  ].filter(item => item.value)

  return (
    <div className="lineups">
      <div className="lineups-score">
        <div className="lineups-side">
          <span className="kit-swatch lg" style={{ background: lineups.home.jersey_color }} />
          <span>{match.home_team_full || match.home_team}</span>
        </div>
        <div className="lineups-result">
          <strong>{match.home_score}</strong>
          <span>–</span>
          <strong>{match.away_score}</strong>
        </div>
        <div className="lineups-side away">
          <span>{match.away_team_full || match.away_team}</span>
          <span className="kit-swatch lg" style={{ background: lineups.away.jersey_color }} />
        </div>
      </div>

      <div className="lineups-grid">
        <TeamColumn team={lineups.home} />
        <TeamColumn team={lineups.away} />
      </div>

      <section className="match-info">
        <h3>Match information</h3>
        <dl>
          {info.map(item => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
