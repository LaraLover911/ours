"use client";

import * as React from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { clamp, ROOM_HALF, type Cue, type Mood, type RoomId } from "@/lib/pet/catalog";
import type { Furniture, HouseRow } from "./use-pet";

export type SceneProps = {
  room: RoomId;
  house: HouseRow | undefined;
  furniture: Furniture[];
  stage: number;
  mood: Mood;
  cue: Cue | null;
  editing: boolean;
  selected: string | null;
  reduced: boolean;
  dark: boolean;
  onSelect: (id: string | null) => void;
  onMove: (f: Furniture, x: number, z: number) => void;
  onTapMochi: () => void;
};

/**
 * Mochi's little house in 3D: low-poly primitives only (no model files to load),
 * a fixed camera and a render loop that stops when the scene is off-screen or
 * the person prefers reduced motion.
 */
export default function PetScene(props: SceneProps) {
  const host = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={host} className="absolute inset-0" style={{ touchAction: props.editing ? "none" : "pan-y" }}>
      <Canvas
        flat
        dpr={[1, 1.75]}
        frameloop={visible && !props.reduced ? "always" : "demand"}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
        camera={{ position: [0, 3.5, 5.6], fov: 40 }}
        onCreated={({ camera }) => camera.lookAt(0, 0.45, 0)}
        onPointerMissed={() => props.editing && props.onSelect(null)}
        aria-label="Mochis Zuhause in 3D"
      >
        <Lights dark={props.dark} room={props.room} />
        <Room room={props.room} house={props.house} dark={props.dark} />
        {props.furniture.map((f) => (
          <FurniturePiece key={f.id} f={f} editing={props.editing} selected={props.selected === f.id} onSelect={props.onSelect} onMove={props.onMove} reduced={props.reduced} />
        ))}
        <Mochi stage={props.stage} mood={props.mood} cue={props.cue} reduced={props.reduced} onTap={props.editing ? undefined : props.onTapMochi} />
      </Canvas>
    </div>
  );
}

function Lights({ dark, room }: { dark: boolean; room: RoomId }) {
  const night = dark || room === "bedroom";
  return (
    <>
      <hemisphereLight args={[night ? "#cdd3ff" : "#fff6f0", night ? "#3a2c3a" : "#d9b3bd", night ? 1.7 : 2.3]} />
      <directionalLight position={[3, 5, 4]} intensity={night ? 1.5 : 2.1} color={night ? "#e3e1ff" : "#fff1e6"} />
    </>
  );
}

function Room({ room, house, dark }: { room: RoomId; house: HouseRow | undefined; dark: boolean }) {
  const S = ROOM_HALF * 2 + 0.3;
  const floor = room === "garden" ? "#a9cf8f" : (house?.floor ?? "#e9d5c4");
  const wall = house?.wall ?? "#f6e3e8";
  return (
    <group>
      <mesh position={[0, -0.07, 0]}>
        <boxGeometry args={[S, 0.14, S]} />
        <meshStandardMaterial color={floor} roughness={0.95} flatShading />
      </mesh>
      {room === "garden" ? (
        <>
          {Array.from({ length: 9 }, (_, i) => (
            <mesh key={i} position={[-S / 2 + 0.2 + i * ((S - 0.4) / 8), 0.3, -S / 2 + 0.08]}>
              <boxGeometry args={[0.1, 0.6, 0.06]} />
              <meshStandardMaterial color="#f4ead9" flatShading />
            </mesh>
          ))}
          <mesh position={[0, 0.42, -S / 2 + 0.06]}>
            <boxGeometry args={[S - 0.3, 0.06, 0.04]} />
            <meshStandardMaterial color="#f4ead9" flatShading />
          </mesh>
          <group position={[-1.45, 0, -1.3]}>
            <mesh position={[0, 0.4, 0]}>
              <cylinderGeometry args={[0.08, 0.11, 0.8, 6]} />
              <meshStandardMaterial color="#8a6247" flatShading />
            </mesh>
            <mesh position={[0, 1.15, 0]}>
              <icosahedronGeometry args={[0.55, 0]} />
              <meshStandardMaterial color="#6fa36b" flatShading />
            </mesh>
          </group>
        </>
      ) : (
        <>
          <mesh position={[0, 1.1, -S / 2]}>
            <boxGeometry args={[S, 2.3, 0.12]} />
            <meshStandardMaterial color={wall} roughness={1} />
          </mesh>
          <mesh position={[-S / 2, 1.1, 0]}>
            <boxGeometry args={[0.12, 2.3, S]} />
            <meshStandardMaterial color={wall} roughness={1} />
          </mesh>
          {/* window */}
          <mesh position={[0.7, 1.35, -S / 2 + 0.07]}>
            <boxGeometry args={[0.9, 0.7, 0.03]} />
            <meshStandardMaterial color={room === "bedroom" || dark ? "#2d3561" : "#bfe0f3"} emissive={room === "bedroom" || dark ? "#1d2350" : "#9fd0ee"} emissiveIntensity={0.35} />
          </mesh>
          <mesh position={[0.7, 1.35, -S / 2 + 0.09]}>
            <boxGeometry args={[0.04, 0.7, 0.02]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          {room === "bedroom" ? (
            <mesh position={[0.95, 1.52, -S / 2 + 0.1]}>
              <sphereGeometry args={[0.09, 10, 8]} />
              <meshStandardMaterial color="#fff6c8" emissive="#fff1a8" emissiveIntensity={0.8} />
            </mesh>
          ) : null}
        </>
      )}
    </group>
  );
}

const FLOOR = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function FurniturePiece({
  f,
  editing,
  selected,
  onSelect,
  onMove,
  reduced,
}: {
  f: Furniture;
  editing: boolean;
  selected: boolean;
  onSelect: (id: string | null) => void;
  onMove: (f: Furniture, x: number, z: number) => void;
  reduced: boolean;
}) {
  const [drag, setDrag] = React.useState<{ x: number; z: number } | null>(null);
  const grab = React.useRef({ dx: 0, dz: 0 });
  const x = drag?.x ?? Number(f.x);
  const z = drag?.z ?? Number(f.z);
  const hit = React.useRef(new THREE.Vector3());

  const down = (e: ThreeEvent<PointerEvent>) => {
    if (!editing) return;
    e.stopPropagation();
    (e.target as unknown as Element).setPointerCapture(e.pointerId);
    onSelect(f.id);
    // Keep the spot you grabbed under the finger instead of jumping to the piece's centre.
    grab.current = e.ray.intersectPlane(FLOOR, hit.current) ? { dx: Number(f.x) - hit.current.x / ROOM_HALF, dz: Number(f.z) - hit.current.z / ROOM_HALF } : { dx: 0, dz: 0 };
    setDrag({ x: Number(f.x), z: Number(f.z) });
  };
  const moveTo = (e: ThreeEvent<PointerEvent>) => {
    if (!drag) return;
    e.stopPropagation();
    if (e.ray.intersectPlane(FLOOR, hit.current)) setDrag({ x: clamp(hit.current.x / ROOM_HALF + grab.current.dx, -1, 1), z: clamp(hit.current.z / ROOM_HALF + grab.current.dz, -1, 1) });
  };
  const up = (e: ThreeEvent<PointerEvent>) => {
    if (!drag) return;
    e.stopPropagation();
    (e.target as unknown as Element).releasePointerCapture?.(e.pointerId);
    const moved = Math.abs(drag.x - Number(f.x)) + Math.abs(drag.z - Number(f.z)) > 0.01;
    if (moved) onMove(f, drag.x, drag.z);
    setDrag(null);
  };

  return (
    <group position={[x * ROOM_HALF, drag ? 0.08 : 0, z * ROOM_HALF]} rotation={[0, (f.rot * Math.PI) / 180, 0]} onPointerDown={down} onPointerMove={moveTo} onPointerUp={up}>
      <Model id={f.item_id} reduced={reduced} />
      {editing ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
          <ringGeometry args={[0.42, selected ? 0.5 : 0.46, 28]} />
          <meshBasicMaterial color={selected ? "#c2557a" : "#ffffff"} transparent opacity={selected ? 0.95 : 0.55} />
        </mesh>
      ) : null}
    </group>
  );
}

const M = ({ color, emissive, flat = true }: { color: string; emissive?: string; flat?: boolean }) => (
  <meshStandardMaterial color={color} emissive={emissive ?? "#000000"} emissiveIntensity={emissive ? 0.9 : 0} flatShading={flat} roughness={0.85} />
);

function Model({ id, reduced }: { id: string; reduced: boolean }) {
  const spin = React.useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!reduced && spin.current) spin.current.rotation.y += dt * 0.6;
  });
  switch (id) {
    case "bed":
      return (
        <group>
          <mesh position={[0, 0.14, 0]}>
            <boxGeometry args={[1.0, 0.28, 0.72]} />
            <M color="#d9c8f0" />
          </mesh>
          {[-0.28, 0.02, 0.3].map((px, i) => (
            <mesh key={i} position={[px, 0.36, 0.02]} scale={[1, 0.55, 0.9]}>
              <icosahedronGeometry args={[0.24, 1]} />
              <M color="#ffffff" />
            </mesh>
          ))}
          <mesh position={[-0.36, 0.42, 0]} scale={[0.6, 0.35, 1]}>
            <icosahedronGeometry args={[0.2, 1]} />
            <M color="#f7c9d6" />
          </mesh>
        </group>
      );
    case "plant":
      return (
        <group>
          <mesh position={[0, 0.15, 0]}>
            <cylinderGeometry args={[0.17, 0.13, 0.3, 7]} />
            <M color="#c9785a" />
          </mesh>
          {[0, 2.1, 4.2].map((a, i) => (
            <mesh key={i} position={[Math.cos(a) * 0.08, 0.5 + i * 0.05, Math.sin(a) * 0.08]} rotation={[Math.sin(a) * 0.4, 0, Math.cos(a) * 0.4]}>
              <coneGeometry args={[0.12, 0.5, 5]} />
              <M color="#5f9a62" />
            </mesh>
          ))}
        </group>
      );
    case "rug":
      return (
        <mesh position={[0, 0.012, 0]}>
          <cylinderGeometry args={[0.62, 0.62, 0.02, 20]} />
          <M color="#c8b5e6" flat={false} />
        </mesh>
      );
    case "lamp":
      return (
        <group>
          <mesh position={[0, 0.03, 0]}>
            <cylinderGeometry args={[0.16, 0.18, 0.06, 10]} />
            <M color="#6f5b5b" />
          </mesh>
          <mesh position={[0, 0.6, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 1.1, 6]} />
            <M color="#6f5b5b" />
          </mesh>
          <mesh position={[0, 1.18, 0]}>
            <cylinderGeometry args={[0.13, 0.26, 0.26, 8, 1, true]} />
            <meshStandardMaterial color="#ffe4a8" emissive="#ffd27a" emissiveIntensity={0.7} side={THREE.DoubleSide} flatShading />
          </mesh>
        </group>
      );
    case "beanbag":
      return (
        <mesh position={[0, 0.22, 0]} scale={[1, 0.62, 1]}>
          <icosahedronGeometry args={[0.38, 1]} />
          <M color="#f0a77c" />
        </mesh>
      );
    case "shelf":
      return (
        <group position={[0, 0, 0]}>
          <mesh position={[0, 0.62, 0]}>
            <boxGeometry args={[0.85, 1.24, 0.3]} />
            <M color="#b88a66" />
          </mesh>
          {[0.3, 0.7, 1.05].map((py, r) => (
            <group key={r}>
              {[-0.28, -0.14, 0.02, 0.18].map((px, i) => (
                <mesh key={i} position={[px, py, 0.13]}>
                  <boxGeometry args={[0.1, 0.24 - ((i + r) % 2) * 0.05, 0.06]} />
                  <M color={["#c2557a", "#6c8fb8", "#e8c36a", "#7aa77b"][(i + r) % 4]} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      );
    case "frame":
      return (
        <group>
          <mesh position={[0, 0.3, -0.05]} rotation={[-0.15, 0, 0]}>
            <boxGeometry args={[0.04, 0.6, 0.04]} />
            <M color="#8a6247" />
          </mesh>
          <mesh position={[0, 0.5, 0]} rotation={[-0.15, 0, 0]}>
            <boxGeometry args={[0.55, 0.42, 0.04]} />
            <M color="#d8b07a" />
          </mesh>
          <mesh position={[0, 0.5, 0.025]} rotation={[-0.15, 0, 0]}>
            <boxGeometry args={[0.45, 0.32, 0.01]} />
            <M color="#f6d9e1" />
          </mesh>
        </group>
      );
    case "stars":
      return (
        <group>
          <mesh position={[0, 0.5, 0]}>
            <cylinderGeometry args={[0.015, 0.015, 1, 5]} />
            <M color="#9c8a96" />
          </mesh>
          <group ref={spin} position={[0, 1.05, 0]}>
            {[0, 1, 2, 3, 4].map((i) => (
              <mesh key={i} position={[Math.cos((i / 5) * Math.PI * 2) * 0.28, Math.sin(i * 1.7) * 0.08, Math.sin((i / 5) * Math.PI * 2) * 0.28]}>
                <octahedronGeometry args={[0.07, 0]} />
                <M color="#fff1a8" emissive="#ffe27a" />
              </mesh>
            ))}
          </group>
        </group>
      );
    case "table":
      return (
        <group>
          <mesh position={[0, 0.42, 0]}>
            <cylinderGeometry args={[0.38, 0.38, 0.05, 12]} />
            <M color="#c79a72" />
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.04, 0.07, 0.4, 6]} />
            <M color="#a57b58" />
          </mesh>
          <mesh position={[0.1, 0.5, 0.05]}>
            <cylinderGeometry args={[0.06, 0.05, 0.1, 8]} />
            <M color="#ffffff" />
          </mesh>
        </group>
      );
    case "flowers":
      return (
        <group>
          <mesh position={[0, 0.06, 0]}>
            <boxGeometry args={[0.8, 0.12, 0.4]} />
            <M color="#8a6247" />
          </mesh>
          {[-0.3, -0.18, -0.06, 0.06, 0.18, 0.3].map((px, i) => (
            <group key={i} position={[px, 0, (i % 2) * 0.12 - 0.06]}>
              <mesh position={[0, 0.22, 0]}>
                <cylinderGeometry args={[0.01, 0.01, 0.2, 4]} />
                <M color="#5f9a62" />
              </mesh>
              <mesh position={[0, 0.34, 0]}>
                <icosahedronGeometry args={[0.06, 0]} />
                <M color={["#f28fb0", "#ffd166", "#c8b5e6", "#ff9f80"][i % 4]} />
              </mesh>
            </group>
          ))}
        </group>
      );
    default:
      return (
        <mesh position={[0, 0.2, 0]}>
          <boxGeometry args={[0.4, 0.4, 0.4]} />
          <M color="#dddddd" />
        </mesh>
      );
  }
}

const STAGE_SCALE = [0.62, 0.7, 0.78, 0.86];
const BODY = "#fff3f0";
const CHEEK = "#f6a9bd";
const INK = "#3b2a33";

/** Mochi: an original little rice-cake spirit with a sprout that grows into a flower. */
function Mochi({ stage, mood, cue, reduced, onTap }: { stage: number; mood: Mood; cue: Cue | null; reduced: boolean; onTap?: () => void }) {
  const root = React.useRef<THREE.Group>(null);
  const body = React.useRef<THREE.Group>(null);
  const eyes = React.useRef<THREE.Group>(null);
  const cueRef = React.useRef(cue);
  React.useEffect(() => {
    cueRef.current = cue;
  });
  const blink = React.useRef({ next: 2, until: 0 });

  const sleeping = mood === "sleeping";
  const droopy = mood === "sleepy" || mood === "bored" || mood === "hungry";
  const closedEyes = sleeping;
  const smileEyes = mood === "happy";

  useFrame((st) => {
    const r = root.current;
    const b = body.current;
    if (!r || !b) return;
    const t = st.clock.elapsedTime;
    if (reduced) {
      b.scale.set(1, 1, 1);
      r.position.y = 0;
      r.rotation.set(0, 0, 0);
      return;
    }
    const breath = Math.sin(t * (sleeping ? 1.3 : 2.6)) * (sleeping ? 0.035 : 0.025);
    let sy = 1 + breath;
    let y = 0;
    let ry = sleeping ? 0 : Math.sin(t * 0.6) * 0.18;
    let rz = droopy ? Math.sin(t * 0.8) * 0.04 : 0;
    let rx = droopy ? 0.08 : 0;

    const c = cueRef.current;
    const a = c ? (Date.now() - c.at) / 1000 : 99;
    if (a < 1.5) {
      const k = 1 - a / 1.5;
      switch (c!.kind) {
        case "feed":
          sy *= 1 - 0.1 * Math.abs(Math.sin(a * 13)) * k;
          rx = -0.1 * k;
          break;
        case "pet":
          sy *= 1 - 0.16 * Math.sin(Math.min(1, a / 0.7) * Math.PI);
          rz = Math.sin(a * 9) * 0.08 * k;
          break;
        case "clean":
          rz = Math.sin(a * 22) * 0.16 * k;
          break;
        case "play":
        case "minigame":
        case "quest":
        case "buy":
          y = Math.abs(Math.sin(a * Math.PI * 2)) * 0.38 * k;
          ry += (a / 1.5) * Math.PI * 2;
          break;
        case "evolve":
          y = Math.sin(Math.min(1, a / 1.5) * Math.PI) * 0.5;
          ry += (a / 1.5) * Math.PI * 4;
          break;
        case "wake":
          sy *= 1 + 0.14 * Math.sin(Math.min(1, a / 0.8) * Math.PI);
          break;
      }
    } else if (mood === "missed_you" || mood === "happy") {
      y = Math.max(0, Math.sin(t * 3)) * (mood === "missed_you" ? 0.1 : 0.04);
    }
    const sx = 1 / Math.sqrt(sy);
    b.scale.set(sx, sy, sx);
    r.position.y = y;
    r.rotation.set(rx, ry, rz);

    // Blink every few seconds.
    const e = eyes.current;
    if (e && !closedEyes && !smileEyes) {
      if (t > blink.current.next) {
        blink.current.until = t + 0.12;
        blink.current.next = t + 2.5 + Math.random() * 3;
      }
      e.scale.y = t < blink.current.until ? 0.12 : droopy ? 0.6 : 1;
    }
  });

  const s = STAGE_SCALE[stage] ?? 1;
  return (
    <group scale={s} position={[0, 0, 0.55]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <circleGeometry args={[0.6, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.13} />
      </mesh>
      <group ref={root}>
        <group ref={body} onClick={onTap ? (e) => (e.stopPropagation(), onTap()) : undefined}>
          <mesh position={[0, 0.5, 0]} scale={[1, 0.8, 0.95]}>
            <sphereGeometry args={[0.62, 16, 12]} />
            <meshStandardMaterial color={BODY} flatShading roughness={0.75} />
          </mesh>
          {/* feet and little arms */}
          {[-1, 1].map((sd) => (
            <group key={sd}>
              <mesh position={[sd * 0.26, 0.06, 0.22]} scale={[1, 0.5, 1.2]}>
                <sphereGeometry args={[0.13, 8, 6]} />
                <meshStandardMaterial color={BODY} flatShading />
              </mesh>
              <mesh position={[sd * 0.58, 0.36, 0.12]} scale={[0.8, 1, 0.8]}>
                <sphereGeometry args={[0.1, 8, 6]} />
                <meshStandardMaterial color={BODY} flatShading />
              </mesh>
            </group>
          ))}
          {/* face */}
          <group ref={eyes} position={[0, 0.6, 0.5]}>
            {[-1, 1].map((sd) =>
              closedEyes || smileEyes ? (
                <mesh key={sd} position={[sd * 0.19, 0, 0.02]} rotation={[0, 0, closedEyes ? Math.PI : 0]}>
                  <torusGeometry args={[0.055, 0.016, 5, 10, Math.PI]} />
                  <meshBasicMaterial color={INK} />
                </mesh>
              ) : (
                <group key={sd} position={[sd * 0.19, 0, 0]}>
                  <mesh scale={[1, mood === "missed_you" ? 1.25 : 1.1, 0.6]}>
                    <sphereGeometry args={[0.07, 10, 8]} />
                    <meshBasicMaterial color={INK} />
                  </mesh>
                  <mesh position={[0.022, 0.025, 0.04]}>
                    <sphereGeometry args={[0.02, 6, 5]} />
                    <meshBasicMaterial color="#ffffff" />
                  </mesh>
                </group>
              ),
            )}
          </group>
          {[-1, 1].map((sd) => (
            <mesh key={sd} position={[sd * 0.34, 0.47, 0.46]} scale={[1, 0.6, 0.3]}>
              <sphereGeometry args={[0.08, 8, 6]} />
              <meshBasicMaterial color={CHEEK} transparent opacity={0.85} />
            </mesh>
          ))}
          <Mouth mood={mood} />
          {mood === "messy"
            ? [
                [0.3, 0.75, 0.38],
                [-0.38, 0.32, 0.42],
                [0.12, 0.25, 0.55],
              ].map((p, i) => (
                <mesh key={i} position={p as [number, number, number]} scale={[1, 1, 0.4]}>
                  <sphereGeometry args={[0.045, 6, 5]} />
                  <meshBasicMaterial color="#a88a72" />
                </mesh>
              ))
            : null}
          <Sprout stage={stage} />
        </group>
      </group>
    </group>
  );
}

function Mouth({ mood }: { mood: Mood }) {
  if (mood === "hungry")
    return (
      <mesh position={[0, 0.47, 0.55]} scale={[1, 1.2, 0.4]}>
        <sphereGeometry args={[0.04, 8, 6]} />
        <meshBasicMaterial color="#8d3a52" />
      </mesh>
    );
  if (mood === "bored" || mood === "sleepy")
    return (
      <mesh position={[0, 0.47, 0.55]}>
        <boxGeometry args={[0.08, 0.016, 0.01]} />
        <meshBasicMaterial color={INK} />
      </mesh>
    );
  return (
    <mesh position={[0, 0.49, 0.55]} rotation={[0, 0, Math.PI]}>
      <torusGeometry args={[0.04, 0.013, 5, 10, Math.PI]} />
      <meshBasicMaterial color={INK} />
    </mesh>
  );
}

function Sprout({ stage }: { stage: number }) {
  return (
    <group position={[0, 0.98, 0]}>
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.015, 0.02, 0.18, 5]} />
        <meshStandardMaterial color="#6fa36b" flatShading />
      </mesh>
      <mesh position={[0.08, 0.15, 0]} rotation={[0, 0, -0.9]} scale={[1, 0.45, 0.6]}>
        <sphereGeometry args={[0.08, 6, 4]} />
        <meshStandardMaterial color="#7fb879" flatShading />
      </mesh>
      {stage >= 1 ? (
        <mesh position={[-0.08, 0.13, 0]} rotation={[0, 0, 0.9]} scale={[1, 0.45, 0.6]}>
          <sphereGeometry args={[0.08, 6, 4]} />
          <meshStandardMaterial color="#7fb879" flatShading />
        </mesh>
      ) : null}
      {stage === 2 ? (
        <mesh position={[0, 0.22, 0]} scale={[0.8, 1.1, 0.8]}>
          <icosahedronGeometry args={[0.07, 0]} />
          <meshStandardMaterial color="#f28fb0" flatShading />
        </mesh>
      ) : null}
      {stage >= 3 ? (
        <group position={[0, 0.22, 0]}>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} position={[Math.cos((i / 5) * Math.PI * 2) * 0.08, 0, Math.sin((i / 5) * Math.PI * 2) * 0.08]} scale={[1, 0.5, 1]}>
              <sphereGeometry args={[0.065, 6, 5]} />
              <meshStandardMaterial color="#f7b6cb" flatShading />
            </mesh>
          ))}
          <mesh>
            <sphereGeometry args={[0.045, 6, 5]} />
            <meshStandardMaterial color="#ffd166" emissive="#ffc44d" emissiveIntensity={0.4} flatShading />
          </mesh>
        </group>
      ) : null}
    </group>
  );
}
