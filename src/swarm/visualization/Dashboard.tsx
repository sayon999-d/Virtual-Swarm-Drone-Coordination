import React, { useState, useMemo, useEffect } from 'react';
import { Simulation, Formation, TrailStyle } from '../simulation/Simulation';
import { CanvasRenderer } from './CanvasRenderer';
import { Square, Play, RotateCcw, X, Plus, Circle, Square as SquareIcon, Zap, Magnet, Activity, ShieldAlert, List, Save, Download } from 'lucide-react';
import { Vector2 } from '../utils/Vector2';
import { Toaster, toast } from 'sonner';
import { ObstacleType } from '../environment/Environment';

export const Dashboard: React.FC = () => {
  const [width] = useState(1000);
  const [height] = useState(700);
  const [numDrones, setNumDrones] = useState(30);
  const [selectedObstacleType, setSelectedObstacleType] = useState<ObstacleType>('circle');
  const [selectedDroneId, setSelectedDroneId] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<'control' | 'log' | 'inspect'>('control');
  const [showFormation, setShowFormation] = useState(true);
  const [loadedState, setLoadedState] = useState<any>(null);
  
  const simulation = useMemo(() => {
    const sim = new Simulation(width, height, numDrones);
    if (loadedState) {
      sim.importState(loadedState);
    }
    return sim;
  }, [width, height, numDrones, loadedState]);
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const handleConfigChange = (key: keyof typeof simulation.config, value: number) => {
    (simulation.config as any)[key] = value;
    setTick(t => t + 1);
  };

  const handleSaveState = () => {
    try {
      const state = simulation.exportState();
      localStorage.setItem('swarm_os_state', JSON.stringify(state));
      toast.success('Simulation state saved to local storage');
    } catch (e) {
      console.error(e);
      toast.error('Failed to save state');
    }
  };

  const handleLoadState = () => {
    try {
      const saved = localStorage.getItem('swarm_os_state');
      if (!saved) {
        toast.error('No saved state found');
        return;
      }
      const data = JSON.parse(saved);
      setLoadedState(data);
      if (data.drones) {
        setNumDrones(data.drones.length);
      }
      toast.success('Simulation state restored');
    } catch (e) {
      console.error(e);
      toast.error('Failed to load state');
    }
  };
  const avgSpeed = simulation.drones.reduce((sum, d) => sum + d.velocity.mag(), 0) / (simulation.drones.length || 1);
  const cohesionPct = 79; // Mock for now

  return (
    <div className="h-screen w-screen bg-background text-foreground flex flex-col font-sans overflow-hidden">
      <Toaster position="bottom-right" theme="dark" />
      {/* HEADER */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card z-10 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500"></div>
          <span className="font-semibold text-primary">Swarm OS</span>
          <span className="text-muted-foreground text-sm">connected</span>
        </div>
        <div className="flex items-center gap-8 text-sm">
          <div className="flex flex-col items-center">
            <span className="text-muted-foreground label">TICK</span>
            <span className="mono text-primary">{simulation.tick}</span>
          </div>
          <div className="w-px h-8 bg-border"></div>
          <div className="flex flex-col items-center">
            <span className="text-muted-foreground label">DRONES</span>
            <span className="mono text-primary">{simulation.drones.length}</span>
          </div>
          <div className="w-px h-8 bg-border"></div>
          <div className="flex flex-col items-center">
            <span className="text-muted-foreground label">FORMATION</span>
            <span className="mono text-primary">{simulation.formation}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => {
            simulation.isRunning = !simulation.isRunning;
            setTick(t => t + 1);
            toast(simulation.isRunning ? 'Simulation Resumed' : 'Simulation Paused');
          }} className="flex items-center gap-2 px-3 py-1.5 border border-border rounded hover:bg-muted transition-colors text-sm">
            {simulation.isRunning ? <Square size={14} /> : <Play size={14} />}
            {simulation.isRunning ? 'Stop' : 'Play'}
          </button>
          <button onClick={() => {
            setLoadedState(null);
            simulation.drones.forEach(d => {
              d.position = new Vector2(width / 2 + (Math.random() * 100 - 50), height / 2 + (Math.random() * 100 - 50));
              d.velocity = new Vector2(Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
              d.energy = 100;
              d.health = 100;
            });
            simulation.collisions = 0;
            simulation.activeCollisions.clear();
            setTick(t => t + 1);
            toast('Simulation Reset');
          }} className="p-1.5 border border-border rounded hover:bg-muted transition-colors" title="Reset Simulation">
            <RotateCcw size={14} />
          </button>
          <div className="w-px h-6 bg-border mx-1"></div>
          <button onClick={handleSaveState} className="p-1.5 border border-border rounded hover:bg-muted transition-colors text-blue-400" title="Quick Save">
            <Save size={14} />
          </button>
          <button onClick={handleLoadState} className="p-1.5 border border-border rounded hover:bg-muted transition-colors text-green-400" title="Quick Load">
            <Download size={14} />
          </button>
        </div>
      </header>
      
      <div className="flex flex-1 overflow-hidden">
        {/* MAIN CANVAS */}
        <div className="flex-1 flex flex-col relative bg-background">
          <div className="absolute inset-0">
            <CanvasRenderer 
              simulation={simulation} 
              selectedObstacleType={selectedObstacleType} 
              onSelectDrone={(id) => {
                setSelectedDroneId(id);
                if (id) setActiveTab('inspect');
              }}
              selectedDroneId={selectedDroneId}
            />
          </div>
        </div>
        
        {/* SIDEBAR */}
        <aside className="w-96 border-l border-border bg-card flex flex-col h-full shrink-0 overflow-hidden">
          {/* TABS HEADER */}
          <div className="grid grid-cols-3 border-b border-border bg-muted/5">
            <button 
              onClick={() => setActiveTab('control')}
              className={`py-3 text-[10px] uppercase tracking-widest font-bold flex flex-col items-center gap-1 transition-all border-r border-border last:border-r-0 ${activeTab === 'control' ? 'bg-primary/5 text-primary border-b-2 border-b-primary' : 'text-muted-foreground hover:bg-muted'}`}
            >
              <Activity size={14} /> <span>CONFIG</span>
            </button>
            <button 
              onClick={() => setActiveTab('log')}
              className={`py-3 text-[10px] uppercase tracking-widest font-bold flex flex-col items-center gap-1 transition-all border-r border-border last:border-r-0 ${activeTab === 'log' ? 'bg-primary/5 text-primary border-b-2 border-b-primary' : 'text-muted-foreground hover:bg-muted'}`}
            >
              <div className="relative">
                <List size={14} />
                {simulation.collisionLog.length > 0 && <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>}
              </div>
              <span>LOGS</span>
            </button>
            <button 
              onClick={() => setActiveTab('inspect')}
              className={`py-3 text-[10px] uppercase tracking-widest font-bold flex flex-col items-center gap-1 transition-all border-r border-border last:border-r-0 ${activeTab === 'inspect' ? 'bg-primary/5 text-primary border-b-2 border-b-primary' : 'text-muted-foreground hover:bg-muted'}`}
            >
              <ShieldAlert size={14} /> <span>INSPECT</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar bg-card">
            {activeTab === 'control' && (
              <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-2 duration-300">
                {/* FORMATION */}
                <div className="p-5 border-b border-border bg-muted/5">
                  <div className="flex justify-between items-center mb-3">
                    <span className="label text-primary">FORMATION MATRIX</span>
                    <button 
                      onClick={() => {
                        simulation.recenter();
                        setTick(t => t+1);
                        toast.success('Swarm Centered & Consolidated');
                      }}
                      className="text-[9px] flex items-center gap-1.5 px-2 py-0.5 border border-primary/30 rounded bg-primary/5 hover:bg-primary/20 text-primary transition-all font-bold uppercase tracking-tighter"
                      title="Snap formation center to current swarm centroid"
                    >
                      <Magnet size={10} /> RE-CENTER
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {['Flock', 'Grid', 'V-Shape', 'Circle', 'Leader', 'Scatter', 'Hexagon', 'Cross'].map(f => (
                      <button key={f} onClick={() => { 
                        simulation.setFormation(f as Formation); 
                        setTick(t => t+1); 
                        toast(`Formation changed to ${f}`);
                      }} className={`py-1.5 text-[9px] border rounded transition-all font-mono ${simulation.formation === f ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20 scale-[1.02]' : 'border-border hover:bg-muted text-muted-foreground'}`}>
                        {f}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4">
                    <ControlSlider label="SPACING" value={simulation.formationSpacing} min={35} max={100} step={1} onChange={(v) => { 
                      simulation.formationSpacing = v; 
                      simulation.setFormation(simulation.formation); 
                      setTick(t => t+1); 
                    }} />
                  </div>
                </div>
                
                {/* SWARM SIZE */}
                <div className="p-5 border-b border-border">
                  <span className="label block mb-3">UNIT DEPLOYMENT</span>
                  <ControlSlider label="DRONE COUNT" value={numDrones} min={10} max={300} step={1} onChange={(v) => {
                    setLoadedState(null);
                    setNumDrones(v);
                    toast(`Swarm size changed to ${v}`);
                  }} />
                </div>

                {/* PERSISTENCE */}
                <div className="p-5 border-b border-border bg-primary/5">
                  <span className="label block mb-3 text-primary">STATE PERSISTENCE</span>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={handleSaveState}
                      className="flex flex-col items-center gap-2 p-3 border border-primary/20 rounded bg-primary/5 hover:bg-primary/20 transition-all group"
                    >
                      <Save size={20} className="text-primary group-hover:scale-110 transition-transform" />
                      <span className="text-[10px] mono font-bold uppercase">Save Current</span>
                    </button>
                    <button 
                      onClick={handleLoadState}
                      className="flex flex-col items-center gap-2 p-3 border border-green-500/20 rounded bg-green-500/5 hover:bg-green-500/20 transition-all group"
                    >
                      <Download size={20} className="text-green-500 group-hover:scale-110 transition-transform" />
                      <span className="text-[10px] mono font-bold uppercase">Load Stored</span>
                    </button>
                  </div>
                  <p className="mt-3 text-[9px] text-muted-foreground mono text-center opacity-60">
                    Saves drone positions, configuration, and environment hazards to local storage.
                  </p>
                </div>

                {/* AUTO PILOT */}
                <div className="p-5 border-b border-border bg-amber-500/5">
                  <div className="flex items-center justify-between mb-4">
                    <span className="label text-amber-500 uppercase tracking-tighter">MISSION: AUTO-PILOT</span>
                    <button 
                      onClick={() => {
                        simulation.config.autoPilot = !simulation.config.autoPilot;
                        setTick(t => t + 1);
                        toast(simulation.config.autoPilot ? 'Auto-Pilot Engaged' : 'Manual Control Restored');
                      }} 
                      className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none ${simulation.config.autoPilot ? 'bg-amber-500' : 'bg-muted'}`}
                    >
                      <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg transition-transform ${simulation.config.autoPilot ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  <div className={`p-3 border rounded border-amber-500/20 bg-amber-500/10 transition-all ${simulation.config.autoPilot ? 'opacity-100 scale-100' : 'opacity-40 grayscale scale-[0.98] pointer-events-none'}`}>
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-2 h-2 rounded-full bg-amber-500 ${simulation.config.autoPilot ? 'animate-pulse' : ''}`} />
                      <span className="text-[10px] mono font-bold uppercase text-amber-500">Autonomous Patrol</span>
                    </div>
                    <p className="text-[9px] text-muted-foreground mono leading-relaxed">
                      Swarm is currently navigating {simulation.autoPilotWaypoints.length} waypoints. Manual targeting is disabled.
                    </p>
                  </div>
                </div>

                {/* SIMULATION CONTROL */}
                <div className="p-5 border-b border-border bg-muted/5">
                  <span className="label block mb-3">TEMPORAL ENGINE</span>
                  <ControlSlider label="TIME SCALE" value={simulation.timeScale} min={0.1} max={5} step={0.1} onChange={(v) => { 
                    simulation.timeScale = v; 
                    setTick(t => t+1); 
                  }} />
                  <div className="flex items-center justify-between mt-5 pt-4 border-t border-border/50">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground font-mono">TELEMETRY TRAILS</span>
                    <button onClick={() => { 
                      simulation.showTrails = !simulation.showTrails; 
                      setTick(t => t+1); 
                    }} className={`px-4 py-1 text-[10px] mono border rounded transition-all ${simulation.showTrails ? 'bg-primary/20 text-primary border-primary' : 'border-border hover:bg-muted text-muted-foreground'}`}>
                      {simulation.showTrails ? 'ACTIVE' : 'OFFLINE'}
                    </button>
                  </div>
                  {simulation.showTrails && (
                    <div className="mt-3 grid grid-cols-4 gap-1">
                      {['Solid', 'Dashed', 'Fading', 'Neon'].map(s => (
                        <button 
                          key={s} 
                          onClick={() => {
                            simulation.trailStyle = s as TrailStyle;
                            setTick(t => t+1);
                          }}
                          className={`py-1 text-[9px] mono border rounded transition-colors ${simulation.trailStyle === s ? 'bg-primary/10 border-primary/40 text-primary' : 'border-border hover:bg-muted text-muted-foreground'}`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-3 font-mono">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">OVERLAY GUIDES</span>
                    <button onClick={() => { 
                      simulation.showFormationPoints = !simulation.showFormationPoints; 
                      setTick(t => t+1); 
                    }} className={`px-4 py-1 text-[10px] border rounded transition-all ${simulation.showFormationPoints ? 'bg-primary/20 text-primary border-primary' : 'border-border hover:bg-muted text-muted-foreground'}`}>
                      {simulation.showFormationPoints ? 'ACTIVE' : 'OFFLINE'}
                    </button>
                  </div>
                </div>

                {/* BEHAVIOR */}
                <div className="p-5 border-b border-border">
                  <span className="label block mb-3">AI BEHAVIOR PROFILE</span>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {['STD', 'CALM', 'AGGRO', 'EXPLORE', 'SWARM'].map(b => (
                      <button key={b} onClick={() => { 
                        simulation.setBehavior(b as any); 
                        setTick(t => t+1); 
                        toast(`Behavior changed to ${b}`);
                      }} className={`py-1.5 text-[10px] mono border rounded transition-all ${simulation.behavior === b ? 'bg-primary/20 text-primary border-primary' : 'border-border hover:bg-muted text-muted-foreground'}`}>
                        {b}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-4 opacity-80">
                    <ControlSlider label="SEPARATION" value={simulation.config.separationWeight} min={0} max={5} step={0.1} onChange={(v) => handleConfigChange('separationWeight', v)} />
                    <ControlSlider label="ALIGNMENT" value={simulation.config.alignmentWeight} min={0} max={5} step={0.1} onChange={(v) => handleConfigChange('alignmentWeight', v)} />
                    <ControlSlider label="COHESION" value={simulation.config.cohesionWeight} min={0} max={5} step={0.1} onChange={(v) => handleConfigChange('cohesionWeight', v)} />
                  </div>
                </div>

                {/* OBSTACLES */}
                <div className="p-5">
                  <span className="label block mb-3">ENVIRONMENTAL HAZARDS</span>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {[
                      { id: 'circle', icon: <Circle size={14} />, label: 'PILLAR' },
                      { id: 'rect', icon: <SquareIcon size={14} />, label: 'BLOCK' },
                      { id: 'electrical_storm', icon: <Zap size={14} />, label: 'STORM' },
                      { id: 'magnetic_field', icon: <Magnet size={14} />, label: 'MAGNET' }
                    ].map(obs => (
                      <button 
                        key={obs.id}
                        onClick={() => setSelectedObstacleType(obs.id as ObstacleType)}
                        className={`py-2 text-[10px] mono flex items-center justify-center gap-2 border rounded transition-all ${selectedObstacleType === obs.id ? 'bg-primary/20 text-primary border-primary' : 'border-border hover:bg-muted text-muted-foreground'}`}
                      >
                        {obs.icon} {obs.label}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => { 
                    simulation.environment.clearObstacles(); 
                    setTick(t => t+1); 
                    toast('Workspace neutralized');
                  }} className="w-full py-2 border border-dashed border-border rounded text-[10px] mono hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-500 transition-all flex items-center justify-center gap-2">
                    <X size={12}/> CLEAR ALL HAZARDS
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'log' && (
              <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-2 duration-300">
                <div className="p-5 border-b border-border bg-muted/5 flex justify-between items-center">
                  <div>
                    <span className="label text-primary">COLLISION FEED</span>
                    <div className="text-[9px] text-muted-foreground mt-1 mono">LIVE SYSTEM TELEMETRY</div>
                  </div>
                  <button 
                    onClick={() => {
                      simulation.collisionLog = [];
                      setTick(t => t+1);
                    }}
                    className="text-[9px] mono px-2 py-1 border border-border rounded hover:bg-red-500/10 hover:text-red-500 transition-colors"
                  >
                    PURGE CACHE
                  </button>
                </div>
                <div className="p-4 space-y-2 overflow-y-auto custom-scrollbar flex-1">
                  {simulation.collisionLog.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-10 text-center opacity-40">
                      <List size={40} className="mb-4 stroke-[1px]" />
                      <div className="text-[10px] uppercase tracking-widest mono">No incidents recorded</div>
                    </div>
                  ) : (
                    simulation.collisionLog.map((log, i) => (
                      <div key={i} className="text-[10px] bg-muted/20 p-3 border-l-2 border-red-500 rounded flex flex-col gap-2 group hover:bg-muted/40 transition-colors">
                        <div className="flex justify-between items-center">
                          <span className="mono text-[9px] text-muted-foreground">[{new Date(log.time).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                          <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold mono ${
                            log.type === 'DISTRESS' ? 'bg-red-500/20 text-red-500 border border-red-500/20' : 
                            log.type === 'LOW_ENERGY' ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/20' : 
                            'bg-blue-500/10 text-blue-400 border border-blue-500/10'
                          }`}>
                            {log.type}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {log.targetType === 'DRONE' ? (
                            <div className="flex flex-col gap-1 w-full">
                              <div className="flex items-center gap-2">
                                <Activity size={10} className="text-blue-400" />
                                <span className="mono font-bold text-[11px]">COLLISION DETECTED</span>
                              </div>
                              <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-2 mt-1">
                                <div className="bg-background/40 p-1.5 rounded border border-border/50 flex flex-col items-center">
                                  <span className="text-[8px] text-muted-foreground uppercase mono tracking-tighter">{log.involvedProfiles?.[0]}</span>
                                  <span className="text-primary font-bold mono">#{log.involvedIds?.[0]?.slice(0, 4)}</span>
                                </div>
                                <span className="text-muted-foreground text-[10px]">VS</span>
                                <div className="bg-background/40 p-1.5 rounded border border-border/50 flex flex-col items-center">
                                  <span className="text-[8px] text-muted-foreground uppercase mono tracking-tighter">{log.involvedProfiles?.[1]}</span>
                                  <span className="text-primary font-bold mono">#{log.involvedIds?.[1]?.slice(0, 4)}</span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1 w-full">
                              <div className="flex items-center gap-2">
                                <ShieldAlert size={10} className="text-orange-400" />
                                <span className="mono font-bold text-[11px] text-orange-400">OBJECT IMPACT</span>
                              </div>
                              <div className="flex items-center justify-between bg-orange-500/5 p-2 rounded border border-orange-500/20 mt-1">
                                <div className="flex flex-col">
                                  <span className="text-[8px] text-muted-foreground uppercase mono tracking-tighter">{log.involvedProfiles?.[0]}</span>
                                  <span className="text-primary font-bold mono">#{log.involvedIds?.[0]?.slice(0, 4)}</span>
                                </div>
                                <div className="h-4 w-px bg-orange-500/20"></div>
                                <span className="text-orange-400 font-bold mono text-[10px] uppercase">{log.obstacleType}</span>
                              </div>
                            </div>
                          )}
                        </div>
                        {(log.relativeVelocity !== undefined || log.impactForce !== undefined) && (
                          <div className="flex border-t border-border/20 pt-2 mt-1 justify-between items-center text-[8px] mono">
                            <div className="flex gap-4">
                               <div className="flex items-center gap-1">
                                 <span className="text-muted-foreground uppercase tracking-tight">REL VELOCITY:</span>
                                 <span className="text-blue-400 font-bold">{log.relativeVelocity?.toFixed(2)} unit/s</span>
                               </div>
                               <div className="flex items-center gap-1">
                                 <span className="text-muted-foreground uppercase tracking-tight">IMPACT FORCE:</span>
                                 <span className="text-red-400 font-bold">{log.impactForce?.toFixed(1)} kG</span>
                               </div>
                            </div>
                            <div className="text-muted-foreground/30 font-bold italic">TELEMETRY DATA</div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === 'inspect' && (
              <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-2 duration-300">
                <div className="p-5 border-b border-border bg-muted/5">
                  <span className="label text-primary">NEURAL INSPECTOR</span>
                  <div className="text-[9px] text-muted-foreground mt-1 mono">DIRECT UNIT ACCESS</div>
                </div>
                <div className="p-5">
                  {selectedDroneId ? (() => {
                    const drone = simulation.drones.find(d => d.id === selectedDroneId);
                    if (!drone) return <div className="text-xs text-muted-foreground p-10 text-center mono">CONNECTION LOST</div>;
                    return (
                      <div className="space-y-6">
                        <div className="bg-primary/5 border border-primary/20 p-4 rounded-lg relative overflow-hidden group">
                          <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Activity size={40} />
                          </div>
                          <div className="flex items-baseline gap-2 mb-2">
                            <span className="text-muted-foreground text-[10px] mono">ID</span>
                            <span className="text-lg font-bold text-primary mono tracking-tighter">{drone.id.slice(0, 8)}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-[9px] text-muted-foreground uppercase mono mb-1">Class</div>
                              <div className="text-xs font-semibold">{drone.behaviorProfile}</div>
                            </div>
                            <div>
                              <div className="text-[9px] text-muted-foreground uppercase mono mb-1">Status</div>
                              <div className={`text-xs font-bold mono ${drone.health > 70 ? 'text-green-500' : drone.health > 30 ? 'text-yellow-500' : 'text-red-500 pulsate'}`}>
                                {drone.health > 70 ? 'NOMINAL' : drone.health > 30 ? 'CAUTION' : 'CRITICAL'}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center text-[10px] mono">
                              <span className="text-muted-foreground uppercase">Energy Reserves</span>
                              <span className="text-primary font-bold">{drone.energy.toFixed(0)}%</span>
                            </div>
                            <div className="w-full h-1 bg-border rounded-full overflow-hidden">
                              <div className={`h-full transition-all duration-300 ${drone.energy > 50 ? 'bg-blue-500' : 'bg-yellow-500'}`} style={{ width: `${drone.energy}%` }}></div>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center text-[10px] mono">
                              <span className="text-muted-foreground uppercase">Structural Integrity</span>
                              <span className="text-primary font-bold">{drone.health.toFixed(0)}%</span>
                            </div>
                            <div className="w-full h-1 bg-border rounded-full overflow-hidden">
                              <div className={`h-full transition-all duration-300 ${drone.health > 50 ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${drone.health}%` }}></div>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-4 border-t border-border">
                          <div className="bg-muted/20 p-2 rounded">
                            <div className="text-[8px] text-muted-foreground uppercase mono mb-1">Velocity</div>
                            <div className="text-xs mono">{drone.velocity.mag().toFixed(2)}m/s</div>
                          </div>
                          <div className="bg-muted/20 p-2 rounded">
                            <div className="text-[8px] text-muted-foreground uppercase mono mb-1">Rotation</div>
                            <div className="text-xs mono">{((drone.rotation * 180) / Math.PI).toFixed(0)}°</div>
                          </div>
                        </div>

                        <div className="space-y-2 mt-6">
                          <div className="text-[10px] text-muted-foreground uppercase mono flex items-center gap-2">
                            <div className="w-1 h-1 rounded-full bg-primary animate-ping"></div>
                            Neural Stream
                          </div>
                          <div className="bg-black/20 font-mono text-[9px] p-3 rounded border border-border h-32 overflow-y-auto custom-scrollbar text-primary/70">
                            <div>[SYSTEM] :: HANDSHAKE SUCCESS</div>
                            <div>[SENSOR] :: ALIGNMENT {simulation.config.alignmentWeight.toFixed(1)}x</div>
                            <div>[SENSOR] :: PROXIMITY {drone.isNearCollision ? 'DANGER' : 'SAFE'}</div>
                            <div>[ENGINE] :: POWER_OUTPUT {drone.acceleration.mag().toFixed(3)}</div>
                            <div className="animate-pulse">_</div>
                          </div>
                        </div>
                      </div>
                    );
                  })() : (
                    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground opacity-40 text-center">
                      <ShieldAlert size={40} className="mb-4 stroke-[1px]" />
                      <div className="text-[10px] uppercase tracking-widest mono">Select unit for direct link</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* FOOTER */}
      <footer className="flex items-center gap-6 px-6 py-2 border-t border-border bg-card text-[10px] uppercase tracking-widest text-muted-foreground z-10 shrink-0">
        <div>DRONES <span className="text-primary mono ml-1">{simulation.drones.length}</span></div>
        <div>TICK/S <span className="text-primary mono ml-1">60.0</span></div>
        <div>STEP MS <span className="text-primary mono ml-1">1.2</span></div>
        <div>AVG SPEED <span className="text-primary mono ml-1">{avgSpeed.toFixed(2)} m/s</span></div>
        <div>COHESION <span className="text-primary mono ml-1">{cohesionPct}%</span></div>
        <div>TOTAL COLLISIONS <span className="text-primary mono ml-1">{simulation.collisions}</span></div>
        <div>CURRENT COLLISIONS <span className="text-primary mono ml-1">{simulation.currentCollisions}</span></div>
      </footer>
    </div>
  );
};

const ControlSlider = ({ label, value, min, max, step, onChange }: { label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void }) => (
  <div>
    <div className="flex justify-between items-center mb-1">
      <label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</label>
      <span className="mono text-sm text-primary">{value.toFixed(step < 0.1 ? 3 : step < 1 ? 1 : 0)}</span>
    </div>
    <input 
      type="range" 
      min={min} 
      max={max} 
      step={step} 
      value={value} 
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-1.5 bg-border appearance-none cursor-pointer accent-primary rounded-full"
    />
  </div>
);
