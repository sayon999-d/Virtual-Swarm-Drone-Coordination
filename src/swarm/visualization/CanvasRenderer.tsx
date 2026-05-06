import React, { useEffect, useRef, useState } from 'react';
import { Simulation } from '../simulation/Simulation';
import { Vector2 } from '../utils/Vector2';

import { ObstacleType } from '../environment/Environment';

interface Props {
  simulation: Simulation;
  selectedObstacleType: ObstacleType;
  onSelectDrone?: (id: string | null) => void;
  selectedDroneId?: string | null;
}

export const CanvasRenderer: React.FC<Props> = ({ simulation, selectedObstacleType, onSelectDrone, selectedDroneId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const draggedObstacleIndexRef = useRef<number | null>(null);
  const hoveredObstacleIndexRef = useRef<number | null>(null);
  
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 });
  const canvasSizeRef = useRef({ width: 1, height: 1, dpr: 1 });
  const hasFramedViewRef = useRef(false);
  const isPanningRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const droneCanvasesRef = useRef<Record<string, HTMLCanvasElement>>({});

  const fitSimulationInView = () => {
    const { width, height } = canvasSizeRef.current;
    if (width <= 1 || height <= 1) return;

    const padding = 120;
    const zoom = Math.min(
      1.15,
      Math.max(0.45, Math.min(width / (simulation.environment.width + padding), height / (simulation.environment.height + padding)))
    );
    const center = new Vector2(simulation.environment.width / 2, simulation.environment.height / 2);
    cameraRef.current = {
      x: width / 2 - center.x * zoom,
      y: height / 2 - center.y * zoom,
      zoom,
    };
  };

  const screenToWorld = (screenX: number, screenY: number) => {
    const { x: cx, y: cy, zoom } = cameraRef.current;
    return new Vector2((screenX - cx) / zoom, (screenY - cy) / zoom);
  };

  useEffect(() => {
    const profiles = {
      'Scout': { ledFront: 'rgba(6, 182, 212, 0.9)', ledBack: 'rgba(34, 211, 238, 0.5)' },
      'Defender': { ledFront: 'rgba(245, 158, 11, 0.9)', ledBack: 'rgba(251, 191, 36, 0.5)' },
      'Worker': { ledFront: 'rgba(34, 197, 94, 0.9)', ledBack: 'rgba(74, 222, 128, 0.5)' },
      'Relay': { ledFront: 'rgba(99, 102, 241, 0.9)', ledBack: 'rgba(129, 140, 248, 0.5)' }
    };

    Object.entries(profiles).forEach(([name, colors]) => {
      const canvas = document.createElement('canvas');
      canvas.width = 64; 
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.translate(32, 32); 

        const armLen = 12;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 6;
        ctx.shadowOffsetY = 10;
        
        ctx.beginPath();
        ctx.moveTo(-armLen, -armLen);
        ctx.lineTo(armLen, armLen);
        ctx.moveTo(-armLen, armLen);
        ctx.lineTo(armLen, -armLen);
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.lineWidth = 4;
        ctx.stroke();
        
        ctx.beginPath();
        ctx.rect(-6, -4, 12, 8);
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.fill();
        
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#111827'; 
        ctx.lineCap = 'square';
        ctx.beginPath(); ctx.moveTo(-armLen, -armLen); ctx.lineTo(armLen, armLen); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-armLen, armLen); ctx.lineTo(armLen, -armLen); ctx.stroke();
        const drawMotor = (x: number, y: number) => {
          ctx.fillStyle = '#1f2937';
          ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#92400e';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.stroke();
          const grad = ctx.createRadialGradient(x - 0.5, y - 0.5, 0, x, y, 2.5);
          grad.addColorStop(0, '#e5e7eb');
          grad.addColorStop(1, '#6b7280');
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
        };
        drawMotor(-armLen, -armLen);
        drawMotor(armLen, -armLen);
        drawMotor(-armLen, armLen);
        drawMotor(armLen, armLen);
        const drawRotor = (x: number, y: number) => {
          ctx.save();
          ctx.translate(x, y);
          const propGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 7);
          propGrad.addColorStop(0, 'rgba(17, 24, 39, 0.1)');
          propGrad.addColorStop(0.8, 'rgba(17, 24, 39, 0.4)');
          propGrad.addColorStop(1, 'rgba(17, 24, 39, 0.0)');
          ctx.fillStyle = propGrad;
          ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = '#000000';
          ctx.beginPath(); ctx.arc(0, 0, 0.8, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        };
        drawRotor(armLen, -armLen);  
        drawRotor(armLen, armLen);   
        drawRotor(-armLen, -armLen); 
        drawRotor(-armLen, armLen);  
        ctx.fillStyle = '#0f172a'; 
        ctx.beginPath(); ctx.roundRect(-7, -4.5, 14, 9, 2); ctx.fill();
        ctx.fillStyle = colors.ledFront;
        ctx.globalAlpha = 0.6;
        ctx.fillRect(-7, -1, 3, 2); // Small decal at the back
        ctx.globalAlpha = 1.0;

        const batGrad = ctx.createLinearGradient(-5, -3.5, 5, 3.5);
        batGrad.addColorStop(0, '#334155');
        batGrad.addColorStop(1, '#0f172a');
        ctx.fillStyle = batGrad;
        ctx.beginPath(); ctx.roundRect(-5, -3.5, 10, 7, 1); ctx.fill();
        ctx.fillStyle = '#000000';
        ctx.fillRect(-1.5, -3.5, 3, 7);
        ctx.fillStyle = '#000000';
        ctx.beginPath(); ctx.roundRect(6, -2, 3, 4, 1); ctx.fill();
        ctx.fillStyle = '#1e293b'; 
        ctx.beginPath(); ctx.arc(8.5, 0, 1.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = colors.ledFront;
        ctx.shadowBlur = 4;
        ctx.shadowColor = colors.ledFront;
        ctx.beginPath(); ctx.arc(armLen - 2, armLen - 2, 1.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(armLen - 2, -armLen + 2, 1.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = colors.ledBack;
        ctx.shadowColor = colors.ledBack;
        ctx.beginPath(); ctx.arc(-armLen + 2, armLen - 2, 1.0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(-armLen + 2, -armLen + 2, 1.0, 0, Math.PI * 2); ctx.fill();
      }
      droneCanvasesRef.current[name] = canvas;
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      simulation.step();

      const { x: cx, y: cy, zoom } = cameraRef.current;
      const { width, height, dpr } = canvasSizeRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(zoom, zoom);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1 / zoom;
      const gridSize = 40;
      
      const startX = Math.floor(-cx / zoom / gridSize) * gridSize;
      const endX = startX + width / zoom + gridSize * 2;
      const startY = Math.floor(-cy / zoom / gridSize) * gridSize;
      const endY = startY + height / zoom + gridSize * 2;

      ctx.beginPath();
      for (let x = startX; x <= endX; x += gridSize) {
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
      }
      for (let y = startY; y <= endY; y += gridSize) {
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
      }
      ctx.stroke();
      simulation.environment.obstacles.forEach((obs, index) => {
        const isHovered = hoveredObstacleIndexRef.current === index;
        ctx.save();
        ctx.translate(obs.position.x, obs.position.y);
        
        if (obs.type === 'circle') {
          const glowMultiplier = isHovered ? 1.5 : 1;
          const baseGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, obs.radius);
          baseGrad.addColorStop(0, `rgba(239, 68, 68, ${0.4 * glowMultiplier})`);
          baseGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
          ctx.fillStyle = baseGrad;
          ctx.beginPath();
          ctx.arc(0, 0, obs.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = isHovered ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.1)';
          ctx.strokeStyle = `rgba(239, 68, 68, ${isHovered ? 1.0 : 0.8})`;
          ctx.lineWidth = (isHovered ? 3 : 2) / zoom;
          ctx.beginPath();
          ctx.arc(0, 0, obs.radius * 0.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.strokeStyle = `rgba(239, 68, 68, ${isHovered ? 0.5 : 0.3})`;
          ctx.lineWidth = 1 / zoom;
          ctx.beginPath();
          ctx.arc(0, 0, obs.radius * 0.4, 0, Math.PI * 2);
          ctx.stroke();
        } else if (obs.type === 'rect') {
          const w = obs.width || 50;
          const h = obs.height || 50;
          const hw = w / 2;
          const hh = h / 2;
          ctx.fillStyle = isHovered ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)';
          ctx.fillRect(-hw - 10, -hh - 10, w + 20, h + 20);
          ctx.fillStyle = isHovered ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.1)';
          ctx.strokeStyle = `rgba(239, 68, 68, ${isHovered ? 1.0 : 0.8})`;
          ctx.lineWidth = (isHovered ? 3 : 2) / zoom;
          ctx.strokeRect(-hw, -hh, w, h);
          ctx.fillRect(-hw, -hh, w, h);
          
          if (isHovered) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1 / zoom;
            ctx.strokeRect(-hw - 4, -hh - 4, w + 8, h + 8);
          }
          ctx.strokeStyle = `rgba(239, 68, 68, ${isHovered ? 0.5 : 0.3})`;
          ctx.lineWidth = 1 / zoom;
          ctx.strokeRect(-hw + 5, -hh + 5, w - 10, h - 10);
        } else if (obs.type === 'electrical_storm') {
          const radius = obs.radius || 60;
          const glowMultiplier = isHovered ? 1.3 : 1.0;
          const baseGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
          baseGrad.addColorStop(0, `rgba(147, 51, 234, ${0.5 * glowMultiplier})`); // Purple
          baseGrad.addColorStop(1, 'rgba(147, 51, 234, 0)');
          ctx.fillStyle = baseGrad;
          ctx.beginPath();
          ctx.arc(0, 0, radius * glowMultiplier, 0, Math.PI * 2);
          ctx.fill();
          if (isHovered) {
            ctx.strokeStyle = 'rgba(168, 85, 247, 0.3)';
            ctx.lineWidth = 2 / zoom;
            ctx.beginPath();
            ctx.arc(0, 0, radius + 5, 0, Math.PI * 2);
            ctx.stroke();
          }
          const flashProb = isHovered ? 0.8 : 0.9; // More flashes when hovered
          const flash = Math.random() > flashProb ? 0.8 : 0.2;
          ctx.strokeStyle = `rgba(216, 180, 254, ${flash})`;
          ctx.lineWidth = (isHovered ? 3 : 2) / zoom;
          ctx.beginPath();
          for (let i = 0; i < (isHovered ? 8 : 5); i++) {
            const angle = Math.random() * Math.PI * 2;
            const r1 = Math.random() * radius * 0.3;
            const r2 = radius * 0.5 + Math.random() * radius * 0.4;
            ctx.moveTo(Math.cos(angle) * r1, Math.sin(angle) * r1);
            ctx.lineTo(Math.cos(angle) * r2, Math.sin(angle) * r2);
          }
          ctx.stroke();
          
        } else if (obs.type === 'magnetic_field') {
          const time = Date.now() / 500;
          const radius = obs.radius || 80;
          const glowMultiplier = isHovered ? 1.3 : 1.0;
          const baseGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * glowMultiplier);
          baseGrad.addColorStop(0, `rgba(14, 165, 233, ${0.3 * glowMultiplier})`); // Cyan
          baseGrad.addColorStop(1, 'rgba(14, 165, 233, 0)');
          ctx.fillStyle = baseGrad;
          ctx.beginPath();
          ctx.arc(0, 0, radius * glowMultiplier, 0, Math.PI * 2);
          ctx.fill();
          const ringColor = isHovered ? 'rgba(56, 189, 248, 0.9)' : 'rgba(56, 189, 248, 0.6)';
          ctx.strokeStyle = ringColor;
          ctx.lineWidth = (isHovered ? 2.5 : 1.5) / zoom;
          for (let i = 1; i <= (isHovered ? 5 : 3); i++) {
            const ringRadius = (radius * ((time + i / (isHovered ? 5 : 3)) % 1));
            ctx.beginPath();
            ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
            ctx.stroke();
          }
        }

        ctx.restore();
      });
      if (simulation.config.autoPilot && simulation.autoPilotWaypoints.length > 0) {
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.2)';
        ctx.lineWidth = 2 / zoom;
        
        ctx.beginPath();
        simulation.autoPilotWaypoints.forEach((wp, index) => {
          if (index === 0) ctx.moveTo(wp.x, wp.y);
          else ctx.lineTo(wp.x, wp.y);
        });
        ctx.closePath();
        ctx.stroke();
        simulation.autoPilotWaypoints.forEach((wp, index) => {
          const isActive = index === simulation.autoPilotIndex;
          
          ctx.save();
          ctx.translate(wp.x, wp.y);
          ctx.beginPath();
          ctx.arc(0, 0, 8 / zoom, 0, Math.PI * 2);
          ctx.strokeStyle = isActive ? 'rgba(245, 158, 11, 1.0)' : 'rgba(245, 158, 11, 0.2)';
          ctx.lineWidth = (isActive ? 2 : 1) / zoom;
          ctx.stroke();
          
          if (isActive) {
            const pulse = Math.sin(Date.now() / 200) * 0.5 + 0.5;
            ctx.beginPath();
            ctx.arc(0, 0, (4 + pulse * 2) / zoom, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(245, 158, 11, 0.8)';
            ctx.fill();
            ctx.fillStyle = 'rgba(245, 158, 11, 1)';
            ctx.font = `bold ${12 / zoom}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(`WP-${index+1}`, 0, -15 / zoom);
          }
          
          ctx.restore();
        });
        
        ctx.restore();
      }
      if (simulation.showFormationPoints && simulation.formation !== 'Scatter' && simulation.formation !== 'Flock') {
        let swarmCenter = new Vector2(0, 0);
        if (simulation.drones.length > 0) {
          for (const drone of simulation.drones) {
            swarmCenter = swarmCenter.add(drone.position);
          }
          swarmCenter = swarmCenter.div(simulation.drones.length);
        }
        const activeTarget = simulation.target || swarmCenter;

        for (const drone of simulation.drones) {
          if (drone.targetOffset) {
            const targetPos = activeTarget.add(drone.targetOffset);
            const isDisrupted = drone.isColliding;
            
            if (isDisrupted) {
              ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)'; // Red alert
              ctx.lineWidth = (2 + Math.random() * 2) / zoom;
              
              const jitterX = (Math.random() - 0.5) * 10;
              const jitterY = (Math.random() - 0.5) * 10;
              
              ctx.beginPath();
              ctx.moveTo(drone.position.x, drone.position.y);
              const midX = (drone.position.x + targetPos.x) / 2 + jitterX;
              const midY = (drone.position.y + targetPos.y) / 2 + jitterY;
              ctx.lineTo(midX, midY);
              ctx.lineTo(targetPos.x, targetPos.y);
              ctx.stroke();
            } else {
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
              ctx.lineWidth = 1 / zoom;
              ctx.beginPath();
              ctx.moveTo(drone.position.x, drone.position.y);
              ctx.lineTo(targetPos.x, targetPos.y);
              ctx.stroke();
            }
            const isAssignedDroneDisrupted = drone.isColliding;
            const nearbyCollision = simulation.collisionEvents.find(e => e.position.distanceSq(targetPos) < 2500); // 50px radius
            const isPointUnstable = isAssignedDroneDisrupted || !!nearbyCollision;
            
            if (isPointUnstable) {
              const intensity = isAssignedDroneDisrupted ? 1.0 : 0.5;
              const tremorX = (Math.random() - 0.5) * (4 * intensity) / zoom;
              const tremorY = (Math.random() - 0.5) * (4 * intensity) / zoom;
              const pulse = 0.5 + Math.sin(simulation.tick * 0.2) * 0.5;
              
              ctx.fillStyle = isAssignedDroneDisrupted ? 'rgba(239, 68, 68, 0.9)' : 'rgba(245, 158, 11, 0.8)'; // Orange if nearby, Red if assigned
              ctx.strokeStyle = `rgba(255, 0, 0, ${0.4 + pulse * 0.6})`;
              ctx.lineWidth = (2 + pulse) / zoom;
              
              ctx.beginPath();
              ctx.arc(targetPos.x + tremorX, targetPos.y + tremorY, 4.5 / zoom, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
              ctx.strokeStyle = `rgba(239, 68, 68, ${0.2 * pulse})`;
              ctx.beginPath();
              ctx.arc(targetPos.x, targetPos.y, (8 + pulse * 4) / zoom, 0, Math.PI * 2);
              ctx.stroke();
            } else {
              ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
              ctx.beginPath();
              ctx.arc(targetPos.x, targetPos.y, 3 / zoom, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
      if (simulation.showTrails) {
        ctx.save();
        const style = simulation.trailStyle || 'Solid';
        
        for (const drone of simulation.drones) {
          if (drone.history.length < 2) continue;
          
          if (style === 'Fading') {
            for (let i = 1; i < drone.history.length; i++) {
              const p1 = drone.history[i-1];
              const p2 = drone.history[i];
              const progress = i / drone.history.length;
              const opacity = progress * 0.4;
              
              ctx.strokeStyle = `rgba(59, 130, 246, ${opacity})`;
              ctx.lineWidth = progress * (2 / zoom);
              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.stroke();
            }
          } else if (style === 'Dashed') {
            ctx.setLineDash([5 / zoom, 5 / zoom]);
            ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
            ctx.lineWidth = 1.5 / zoom;
            ctx.beginPath();
            ctx.moveTo(drone.history[0].x, drone.history[0].y);
            for (let i = 1; i < drone.history.length; i++) {
              ctx.lineTo(drone.history[i].x, drone.history[i].y);
            }
            ctx.stroke();
          } else if (style === 'Neon') {
            ctx.shadowBlur = 10;
            ctx.shadowColor = 'rgba(59, 130, 246, 0.8)';
            ctx.strokeStyle = 'rgba(147, 197, 253, 0.6)';
            ctx.lineWidth = 2 / zoom;
            ctx.beginPath();
            ctx.moveTo(drone.history[0].x, drone.history[0].y);
            for (let i = 1; i < drone.history.length; i++) {
              ctx.lineTo(drone.history[i].x, drone.history[i].y);
            }
            ctx.stroke();
          } else {
            ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
            ctx.lineWidth = 1.5 / zoom;
            ctx.beginPath();
            ctx.moveTo(drone.history[0].x, drone.history[0].y);
            for (let i = 1; i < drone.history.length; i++) {
              ctx.lineTo(drone.history[i].x, drone.history[i].y);
            }
            ctx.stroke();
          }
        }
        ctx.restore();
      }
      const now = Date.now();
      for (const event of simulation.collisionEvents) {
        const age = now - event.time;
        if (age < 500) {
          const progress = age / 500; // 0 to 1
          
          ctx.save();
          ctx.translate(event.position.x, event.position.y);
          const radius = 10 + progress * 30;
          ctx.strokeStyle = `rgba(239, 68, 68, ${1 - progress})`; // Fading red
          ctx.lineWidth = 3 * (1 - progress);
          ctx.beginPath();
          ctx.arc(0, 0, radius, 0, Math.PI * 2);
          ctx.stroke();
          if (progress < 0.2) {
            ctx.fillStyle = `rgba(255, 255, 255, ${1 - progress * 5})`;
            ctx.beginPath();
            ctx.arc(0, 0, 15, 0, Math.PI * 2);
            ctx.fill();
          }
          let particleColor = 'rgba(250, 204, 21,'; // Default Yellow sparks
          if (event.type === 'DISTRESS') {
            particleColor = 'rgba(239, 68, 68,'; // Red
          } else if (event.type === 'LOW_ENERGY') {
            particleColor = 'rgba(234, 179, 8,'; // Yellow
          } else if (event.type === 'HAZARD_DETECTED') {
            particleColor = 'rgba(168, 85, 247,'; // Purple
          }

          ctx.fillStyle = `${particleColor} ${1 - progress})`; 
          for (let i = 0; i < 8; i++) { // Slightly more particles
            const particleSeed = (event.seed * 1000 + i) * 1.5;
            const angleOffset = Math.sin(particleSeed) * 0.5;
            const angle = ((event.time + i) * 137.5) % (Math.PI * 2) + angleOffset;
            const spreadSpeed = 0.5 + Math.abs(Math.sin(particleSeed * 0.789)) * 1.5;
            const dist = 5 + progress * 80 * spreadSpeed; 
            
            const px = Math.cos(angle) * dist;
            const py = Math.sin(angle) * dist;
            
            ctx.beginPath();
            ctx.arc(px, py, 2.5 * (1 - progress), 0, Math.PI * 2);
            ctx.fill();
          }
          
          ctx.restore();
        }
      }
      for (const drone of simulation.drones) {
        ctx.save();
        ctx.translate(drone.position.x, drone.position.y);
        ctx.rotate(drone.rotation);
        const scaleX = Math.cos(drone.pitch);
        const scaleY = Math.cos(drone.roll);
        const visualScale = drone.radius / 12;
        ctx.scale(scaleX * visualScale, scaleY * visualScale);

        const armLen = 12;
        const zoomScale = Math.max(0.5, zoom);
        const time = Date.now() / 1000;
        const profileCanvas = droneCanvasesRef.current[drone.behaviorProfile];
        if (profileCanvas) {
          ctx.drawImage(profileCanvas, -32, -32);
        } else if (Object.values(droneCanvasesRef.current)[0]) {
          ctx.drawImage(Object.values(droneCanvasesRef.current)[0], -32, -32);
        }
        if (drone.isColliding || drone.isNearCollision) {
          const isDanger = drone.isNearCollision && !drone.isColliding;
          const flash = Math.abs(Math.sin(Date.now() / (isDanger ? 150 : 100)));
          ctx.strokeStyle = isDanger 
            ? `rgba(245, 158, 11, ${0.3 + flash * 0.4})` // Amber for near-collision
            : `rgba(239, 68, 68, ${0.4 + flash * 0.6})`; // Red for actual collision
            
          ctx.lineWidth = (isDanger ? 1.5 : 2.5) / visualScale;
          ctx.beginPath();
          ctx.arc(0, 0, (isDanger ? 18 : 16), 0, Math.PI * 2);
          ctx.stroke();
          
          if (isDanger) {
            ctx.save();
            ctx.rotate(-drone.rotation); // Keep icon upright
            ctx.translate(0, -28);
            ctx.scale(1/zoomScale, 1/zoomScale);
            
            ctx.fillStyle = `rgba(245, 158, 11, ${0.6 + flash * 0.4})`;
            ctx.beginPath();
            ctx.moveTo(0, -6);
            ctx.lineTo(-6, 4);
            ctx.lineTo(6, 4);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = 'black';
            ctx.fillRect(-0.5, -2, 1, 3);
            ctx.fillRect(-0.5, 2, 1, 1);
            ctx.restore();
          } else {
            ctx.fillStyle = `rgba(239, 68, 68, ${0.1 + flash * 0.2})`;
            ctx.beginPath();
            ctx.arc(0, 0, 14, 0, Math.PI * 2);
            ctx.fill();
          }
          if (drone.lastCollisionObstacleType === 'electrical_storm') {
            ctx.strokeStyle = `rgba(168, 85, 247, ${0.6 + Math.random() * 0.4})`; // Purple/Violet
            ctx.lineWidth = 1.5 / visualScale;
            for (let i = 0; i < 3; i++) {
              ctx.beginPath();
              let lx = (Math.random() - 0.5) * 20;
              let ly = (Math.random() - 0.5) * 20;
              ctx.moveTo(lx, ly);
              for (let j = 0; j < 3; j++) {
                lx += (Math.random() - 0.5) * 10;
                ly += (Math.random() - 0.5) * 10;
                ctx.lineTo(lx, ly);
              }
              ctx.stroke();
            }
          } else if (drone.lastCollisionObstacleType === 'magnetic_field') {
            const swirlTime = Date.now() / 200;
            ctx.strokeStyle = 'rgba(14, 165, 233, 0.6)'; // Cyan
            ctx.lineWidth = 1 / visualScale;
            for (let i = 0; i < 3; i++) {
              const r = 8 + i * 4 + Math.sin(swirlTime + i) * 2;
              ctx.beginPath();
              ctx.arc(0, 0, r, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
        }
        const state = drone.getState();
        if (state.messages && state.messages.length > 0) {
          const pulse = (Date.now() % 1000) / 1000; // 0 to 1
          const radius = 16 + pulse * 20;
          
          let color = 'rgba(59, 130, 246,'; // Blue default
          if (state.messages.some(m => m.type === 'DISTRESS')) {
            color = 'rgba(239, 68, 68,'; // Red for distress
          } else if (state.messages.some(m => m.type === 'LOW_ENERGY')) {
            color = 'rgba(234, 179, 8,'; // Yellow for low energy
          } else if (state.messages.some(m => m.type === 'HAZARD_DETECTED')) {
            color = 'rgba(168, 85, 247,'; // Purple for hazard detected
          }
          
          ctx.strokeStyle = `${color} ${1 - pulse})`;
          ctx.lineWidth = 2 / visualScale;
          ctx.beginPath();
          ctx.arc(0, 0, radius, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (selectedDroneId === drone.id) {
          const selectPulse = (Math.sin(Date.now() / 300) + 1) / 2; // 0 to 1
          ctx.beginPath();
          const gradient = ctx.createRadialGradient(0, 0, 10, 0, 0, 35);
          gradient.addColorStop(0, `rgba(234, 179, 8, ${0.1 + selectPulse * 0.2})`);
          gradient.addColorStop(1, 'rgba(234, 179, 8, 0)');
          ctx.fillStyle = gradient;
          ctx.arc(0, 0, 35, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#eab308'; // Yellow
          ctx.lineWidth = (1.5 + selectPulse) / visualScale;
          ctx.beginPath();
          ctx.arc(0, 0, 24 + selectPulse * 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.lineWidth = 1.5 / visualScale;
          ctx.beginPath(); ctx.moveTo(-28 - selectPulse * 4, 0); ctx.lineTo(-20, 0); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(28 + selectPulse * 4, 0); ctx.lineTo(20, 0); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, -28 - selectPulse * 4); ctx.lineTo(0, -20); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, 28 + selectPulse * 4); ctx.lineTo(0, 20); ctx.stroke();
        }
        if (drone.isLeader) {
          const leaderPulse = (Math.sin(Date.now() / 240) + 1) / 2;
          ctx.save();
          ctx.rotate(-drone.rotation);
          ctx.strokeStyle = `rgba(34, 197, 94, ${0.55 + leaderPulse * 0.35})`;
          ctx.lineWidth = (2 + leaderPulse) / visualScale;
          ctx.setLineDash([4 / visualScale, 3 / visualScale]);
          ctx.beginPath();
          ctx.arc(0, 0, 30 + leaderPulse * 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(34, 197, 94, 0.95)';
          ctx.font = `bold ${9 / visualScale}px monospace`;
          ctx.textAlign = 'center';
          ctx.fillText('LEADER', 0, -38 / visualScale);
          if (drone.leaderCommand) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.font = `${7 / visualScale}px monospace`;
            ctx.fillText(drone.leaderCommand, 0, -30 / visualScale);
          }
          ctx.restore();
        }
        ctx.rotate(-drone.rotation);
        ctx.scale(1 / visualScale, 1 / visualScale); // undo visual scale
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(drone.id, 0, -22);
        const barW = 20;
        const barH = 3;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(-barW/2, 20, barW, barH);
        ctx.fillStyle = drone.energy > 30 ? '#3b82f6' : '#ef4444'; // Blue or Red
        ctx.fillRect(-barW/2, 20, barW * (drone.energy / 100), barH);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(-barW/2, 24, barW, barH);
        ctx.fillStyle = drone.health > 30 ? '#22c55e' : '#ef4444'; // Green or Red
        ctx.fillRect(-barW/2, 24, barW * (drone.health / 100), barH);

        ctx.restore();
      }

      ctx.restore();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '12px monospace';
      ctx.fillText(`ZOOM: ${zoom.toFixed(2)}x | PAN: Middle Click / Alt+Drag`, 20, height - 20);

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [simulation]);

  const updateTarget = (e: React.MouseEvent | React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPos = screenToWorld(screenX, screenY);
    
    if (e.shiftKey) {
      if (e.type === 'pointerdown') {
        let radius = 25;
        let width = 50;
        let height = 50;
        let intensity = 1.0;
        
        if (selectedObstacleType === 'electrical_storm') {
          radius = 60;
          intensity = 1.2;
        } else if (selectedObstacleType === 'magnetic_field') {
          radius = 80;
          intensity = 1.5;
        }

        simulation.environment.addObstacle({ 
          type: selectedObstacleType,
          position: worldPos, 
          radius,
          width,
          height,
          intensity
        });
      }
    } else {
      simulation.setTarget(worldPos.x, worldPos.y);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || e.altKey) { // Middle click or Alt+Click
      isPanningRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
    } else {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const clickPos = screenToWorld(screenX, screenY);
      if (!e.shiftKey) {
        let clickedObstacleIndex = -1;
        for (let i = simulation.environment.obstacles.length - 1; i >= 0; i--) {
          const obs = simulation.environment.obstacles[i];
          if (obs.type === 'circle') {
            if (obs.position.distanceSq(clickPos) < obs.radius * obs.radius) {
              clickedObstacleIndex = i;
              break;
            }
          } else if (obs.type === 'rect') {
            const hw = (obs.width || 50) / 2;
            const hh = (obs.height || 50) / 2;
            if (clickPos.x >= obs.position.x - hw && clickPos.x <= obs.position.x + hw &&
                clickPos.y >= obs.position.y - hh && clickPos.y <= obs.position.y + hh) {
              clickedObstacleIndex = i;
              break;
            }
          }
        }

        if (clickedObstacleIndex !== -1) {
          draggedObstacleIndexRef.current = clickedObstacleIndex;
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }
      }
      if (onSelectDrone) {
        let clickedDrone = null;
        for (const drone of simulation.drones) {
          if (drone.position.distanceSq(clickPos) < (drone.radius * 2) * (drone.radius * 2)) {
            clickedDrone = drone;
            break;
          }
        }

        if (clickedDrone) {
          onSelectDrone(clickedDrone.id);
          return; // Don't drag target if we clicked a drone
        } else {
          onSelectDrone(null); // Deselect if clicked empty space
        }
      }

      setIsDragging(true);
      updateTarget(e);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPos = screenToWorld(screenX, screenY);
    let hoveredIdx = -1;
    for (let i = simulation.environment.obstacles.length - 1; i >= 0; i--) {
      const obs = simulation.environment.obstacles[i];
      if (obs.type === 'rect') {
        const hw = (obs.width || 50) / 2;
        const hh = (obs.height || 50) / 2;
        if (worldPos.x >= obs.position.x - hw && worldPos.x <= obs.position.x + hw &&
            worldPos.y >= obs.position.y - hh && worldPos.y <= obs.position.y + hh) {
          hoveredIdx = i;
          break;
        }
      } else {
        if (obs.position.distanceSq(worldPos) < obs.radius * obs.radius) {
          hoveredIdx = i;
          break;
        }
      }
    }
    hoveredObstacleIndexRef.current = hoveredIdx === -1 ? null : hoveredIdx;

    if (isPanningRef.current) {
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      cameraRef.current.x += dx;
      cameraRef.current.y += dy;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    } else if (draggedObstacleIndexRef.current !== null) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const worldPos = screenToWorld(screenX, screenY);
      
      simulation.environment.obstacles[draggedObstacleIndexRef.current].position = worldPos;
    } else if (isDragging) {
      updateTarget(e);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isPanningRef.current = false;
    setIsDragging(false);
    draggedObstacleIndexRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handlePointerLeave = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isPanningRef.current = false;
    setIsDragging(false);
    draggedObstacleIndexRef.current = null;
    hoveredObstacleIndexRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    const newZoom = Math.max(0.45, Math.min(3, cameraRef.current.zoom * (1 + delta)));
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const worldX = (mouseX - cameraRef.current.x) / cameraRef.current.zoom;
    const worldY = (mouseY - cameraRef.current.y) / cameraRef.current.zoom;

    cameraRef.current.x = mouseX - worldX * newZoom;
    cameraRef.current.y = mouseY - worldY * newZoom;
    cameraRef.current.zoom = newZoom;
  };

  useEffect(() => {
    hasFramedViewRef.current = false;

    const handleResize = () => {
      const canvas = canvasRef.current;
      const parent = canvas?.parentElement;
      if (!canvas || !parent) return;

      const rect = parent.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvasSizeRef.current = { width, height, dpr };

      if (!hasFramedViewRef.current || cameraRef.current.zoom < 0.45) {
        fitSimulationInView();
        hasFramedViewRef.current = true;
      }
    };
    handleResize();
    const parent = canvasRef.current?.parentElement;
    const resizeObserver = parent ? new ResizeObserver(handleResize) : null;
    if (parent) resizeObserver?.observe(parent);
    window.addEventListener('resize', handleResize);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [simulation]);

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onWheel={handleWheel}
      onDoubleClick={fitSimulationInView}
      className="panel cursor-crosshair w-full h-full bg-background"
      style={{ touchAction: 'none' }}
    />
  );
};
