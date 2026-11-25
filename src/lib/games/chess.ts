/**
 * Chess move hints for the board UI. The database (public.chess_* functions) is
 * the referee; this mirrors its rules only so the board can highlight legal
 * targets before you tap.
 * Board: 64 chars, a8 = 0 … h1 = 63, upper case = white, "." empty.
 */
const at = (b: string, r: number, c: number) => (r >= 0 && r < 8 && c >= 0 && c < 8 ? b[r * 8 + c] : null);
const isWhite = (p: string) => p >= "A" && p <= "Z";
const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const KING = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export function attacked(b: string, sq: number, byWhite: boolean): boolean {
  const r = Math.floor(sq / 8), c = sq % 8;
  const P = byWhite ? "P" : "p";
  const pr = byWhite ? r + 1 : r - 1;
  if (at(b, pr, c - 1) === P || at(b, pr, c + 1) === P) return true;
  for (const [dr, dc] of KNIGHT) if (at(b, r + dr, c + dc) === (byWhite ? "N" : "n")) return true;
  for (const [dr, dc] of KING) {
    if (at(b, r + dr, c + dc) === (byWhite ? "K" : "k")) return true;
    for (let i = 1; ; i++) {
      const p = at(b, r + dr * i, c + dc * i);
      if (p == null) break;
      if (p !== ".") {
        const straight = dr === 0 || dc === 0;
        const hits = straight ? ["R", "Q"] : ["B", "Q"];
        if (hits.map((h) => (byWhite ? h : h.toLowerCase())).includes(p)) return true;
        break;
      }
    }
  }
  return false;
}

function targets(b: string, from: number, castling: string, ep: number): number[] {
  const p = b[from];
  if (p === ".") return [];
  const white = isWhite(p), k = p.toUpperCase(), r = Math.floor(from / 8), c = from % 8;
  const out: number[] = [];
  const enemy = (t: string | null) => t != null && t !== "." && isWhite(t) !== white;
  if (k === "P") {
    const d = white ? -1 : 1;
    if (at(b, r + d, c) === ".") {
      out.push((r + d) * 8 + c);
      if (r === (white ? 6 : 1) && at(b, r + 2 * d, c) === ".") out.push((r + 2 * d) * 8 + c);
    }
    for (const dc of [-1, 1]) {
      const t = at(b, r + d, c + dc);
      if (enemy(t) || (t === "." && (r + d) * 8 + c + dc === ep)) out.push((r + d) * 8 + c + dc);
    }
  } else if (k === "N" || k === "K") {
    for (const [dr, dc] of k === "N" ? KNIGHT : KING) {
      const t = at(b, r + dr, c + dc);
      if (t === "." || enemy(t)) out.push((r + dr) * 8 + c + dc);
    }
    const home = white ? 60 : 4;
    if (k === "K" && from === home && !attacked(b, home, !white)) {
      const [K, Q, R] = white ? ["K", "Q", "R"] : ["k", "q", "r"];
      if (castling.includes(K) && b[home + 1] === "." && b[home + 2] === "." && b[home + 3] === R && !attacked(b, home + 1, !white) && !attacked(b, home + 2, !white)) out.push(home + 2);
      if (castling.includes(Q) && b[home - 1] === "." && b[home - 2] === "." && b[home - 3] === "." && b[home - 4] === R && !attacked(b, home - 1, !white) && !attacked(b, home - 2, !white)) out.push(home - 2);
    }
  } else {
    const dirs = k === "R" ? KING.slice(0, 4) : k === "B" ? KING.slice(4) : KING;
    for (const [dr, dc] of dirs) {
      for (let i = 1; ; i++) {
        const t = at(b, r + dr * i, c + dc * i);
        if (t == null) break;
        if (t === ".") out.push((r + dr * i) * 8 + c + dc * i);
        else {
          if (enemy(t)) out.push((r + dr * i) * 8 + c + dc * i);
          break;
        }
      }
    }
  }
  return out;
}

export function apply(b: string, from: number, to: number, promo = "q", ep = -1): string {
  const s = b.split("");
  let p = s[from];
  const white = isWhite(p), k = p.toUpperCase(), row0 = from - (from % 8);
  if (k === "P" && to === ep && s[to] === ".") s[Math.floor(from / 8) * 8 + (to % 8)] = ".";
  s[from] = ".";
  if (k === "P" && (to < 8 || to >= 56)) p = white ? promo.toUpperCase() : promo.toLowerCase();
  s[to] = p;
  if (k === "K" && Math.abs((to % 8) - (from % 8)) === 2) {
    const R = white ? "R" : "r";
    if (to % 8 === 6) [s[row0 + 7], s[row0 + 5]] = [".", R];
    else [s[row0], s[row0 + 3]] = [".", R];
  }
  return s.join("");
}

export function legalTargets(b: string, from: number, castling: string, ep: number): number[] {
  const p = b[from];
  if (!p || p === ".") return [];
  const white = isWhite(p);
  return targets(b, from, castling, ep).filter((t) => {
    const nb = apply(b, from, t, "q", ep);
    return !attacked(nb, nb.indexOf(white ? "K" : "k"), !white);
  });
}

export const PIECES: Record<string, string> = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙", k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
export { isWhite };
