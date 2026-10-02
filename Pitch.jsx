import React, { useEffect, useRef } from 'react'

const PITCH_WIDTH = 105; // Standard pitch width in meters
const PITCH_HEIGHT = 68; // Standard pitch height in meters
const SCALE = 8; // Scale factor for canvas rendering

const Pitch = ({ frameData }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw Pitch Background
    ctx.fillStyle = '#2e7d32'; // Grass green
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw Pitch Lines
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    // Center line
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    // Center circle
    ctx.arc(canvas.width / 2, canvas.height / 2, 9.15 * SCALE, 0, 2 * Math.PI);
    ctx.stroke();

    if (!frameData) return;

    // Helper to map coordinates from kloppy (-pitch/2 to pitch/2 roughly) to canvas
    // Note: SkillCorner coordinates are typically in meters from pitch center (0,0)
    const mapX = (x) => (x + PITCH_WIDTH / 2) * SCALE;
    const mapY = (y) => (y + PITCH_HEIGHT / 2) * SCALE;

    // Draw Players
    frameData.players.forEach(player => {
      ctx.beginPath();
      ctx.arc(mapX(player.x), mapY(player.y), 4, 0, 2 * Math.PI);
      ctx.fillStyle = player.team === 'home' ? '#1976d2' : '#d32f2f'; // Blue vs Red
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Draw Ball
    if (frameData.ball && frameData.ball.x !== null) {
      ctx.beginPath();
      ctx.arc(mapX(frameData.ball.x), mapY(frameData.ball.y), 3, 0, 2 * Math.PI);
      ctx.fillStyle = '#ffffff'; // White ball
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.stroke();
    }
    
  }, [frameData]);

  return (
    <div className="pitch-container">
      <canvas 
        ref={canvasRef} 
        width={PITCH_WIDTH * SCALE} 
        height={PITCH_HEIGHT * SCALE}
        className="pitch-canvas"
      />
    </div>
  )
}

export default Pitch
