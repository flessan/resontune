import { describe, expect, it } from 'vitest';
import { FlowEngine } from './engine';
import type { Note } from './types';

function note(partial: Partial<Note> & Pick<Note, 'id' | 'time' | 'lane'>): Note {
  return {
    duration: 0,
    hit: false,
    missed: false,
    judged: false,
    holding: false,
    chordGroup: null,
    section: 'verse',
    ...partial,
  };
}

function live(engine: FlowEngine, time: number): void {
  engine.playing = true;
  engine.paused = false;
  engine.finished = false;
  engine.playOffset = time;
}

describe('multi-input holds', () => {
  it('tracks two holds independently and only releases the matching input', () => {
    const engine = new FlowEngine();
    live(engine, 0);
    engine.notes = [
      note({ id: 0, time: 0, lane: 0, duration: 1.2 }),
      note({ id: 1, time: 0, lane: 1, duration: 1.2, chordGroup: 1 }),
    ];
    engine.notes[0].chordGroup = 1;
    engine.tap('k:KeyD', null);
    engine.tap('k:KeyK', null);
    expect(engine.holds).toHaveLength(2);
    expect(engine.notes.every((n) => n.holding)).toBe(true);

    engine.release('k:KeyD');
    expect(engine.holds).toHaveLength(2);
    expect(engine.holds[0].inputs.size).toBe(0);
    expect(engine.holds[1].inputs.has('k:KeyK')).toBe(true);
    expect(engine.notes.every((n) => n.holding)).toBe(true);
    engine.dispose();
  });

  it('allows a tap on the other lane while a hold is still down', () => {
    const engine = new FlowEngine();
    live(engine, 0);
    engine.notes = [
      note({ id: 0, time: 0, lane: 0, duration: 1.3 }),
      note({ id: 1, time: 0.4, lane: 1 }),
    ];
    engine.tap('k:KeyD', null);
    expect(engine.notes[0].holding).toBe(true);
    live(engine, 0.4);
    engine.tap('k:KeyK', null);
    expect(engine.notes[1].hit).toBe(true);
    expect(engine.notes[0].holding).toBe(true);
    expect(engine.holds).toHaveLength(1);
    engine.dispose();
  });

  it('keeps a hold alive when a later tap contact joins and the starter releases', () => {
    const engine = new FlowEngine();
    live(engine, 0);
    engine.notes = [
      note({ id: 0, time: 0, lane: 0, duration: 1.2 }),
      note({ id: 1, time: 0.2, lane: 1 }),
    ];
    engine.tap('k:KeyA', null);
    live(engine, 0.2);
    engine.tap('k:KeyD', null);
    engine.release('k:KeyA');
    expect(engine.holds).toHaveLength(1);
    expect(engine.holds[0].inputs.has('k:KeyD')).toBe(true);
    engine.release('k:KeyD');
    expect(engine.holds).toHaveLength(1);
    expect(engine.counts.drop).toBe(0);
    engine.dispose();
  });

  it('keeps accepting independent input in Classic while a hold is down', () => {
    const engine = new FlowEngine();
    engine.modifiers.add('classic');
    live(engine, 0);
    engine.notes = [
      note({ id: 0, time: 0, lane: 0, duration: 1.2 }),
      note({ id: 1, time: 0.2, lane: 1 }),
    ];
    engine.tap('k:KeyD', null);
    live(engine, 0.2);
    engine.tap('k:KeyK', null);
    expect(engine.notes[1].hit).toBe(true);
    expect(engine.holds).toHaveLength(1);
    engine.dispose();
  });

  it('flashes CHORD when the partner of a chord lands', () => {
    const engine = new FlowEngine();
    live(engine, 0);
    engine.notes = [
      note({ id: 0, time: 0, lane: 0, chordGroup: 1 }),
      note({ id: 1, time: 0, lane: 1, chordGroup: 1 }),
    ];
    engine.tap('k:KeyD', null);
    expect(engine.judgeFlash).toBe('PERFECT');
    engine.tap('k:KeyK', null);
    expect(engine.judgeFlash).toBe('CHORD');
    engine.dispose();
  });

  it('gives autoplay holds unique input ids', () => {
    const engine = new FlowEngine();
    engine.auto = true;
    live(engine, 0);
    engine.notes = [
      note({ id: 0, time: 0, lane: 0, duration: 1.2 }),
      note({ id: 1, time: 0, lane: 1, duration: 1.2 }),
    ];
    engine.tick();
    expect(engine.holds).toHaveLength(2);
    expect(engine.holds[0].inputs).not.toBe(engine.holds[1].inputs);
    engine.dispose();
  });

  it('does not judge, miss, or autoplay while paused', () => {
    const engine = new FlowEngine();
    engine.auto = true;
    live(engine, 0);
    engine.paused = true;
    engine.notes = [note({ id: 0, time: 0, lane: 0, duration: 1.2 })];
    engine.tick();
    expect(engine.notes[0].hit).toBe(false);
    expect(engine.notes[0].judged).toBe(false);
    expect(engine.holds).toHaveLength(0);
    engine.dispose();
  });

  it('keeps hold progress frozen across a pause tick', () => {
    const engine = new FlowEngine();
    live(engine, 0);
    engine.notes = [note({ id: 0, time: 0, lane: 0, duration: 1.2 })];
    engine.tap('k:KeyD', null);
    expect(engine.holds).toHaveLength(1);
    const nextTick = engine.holds[0].nextTick;
    engine.paused = true;
    live(engine, 0.5);
    engine.paused = true;
    engine.tick();
    expect(engine.holds).toHaveLength(1);
    expect(engine.holds[0].nextTick).toBe(nextTick);
    engine.dispose();
  });

  it('plays a tick every fourth hold tick', () => {
    const engine = new FlowEngine();
    const kinds: string[] = [];
    engine.audio.hit = (kind) => {
      kinds.push(kind);
    };
    live(engine, 0);
    engine.notes = [note({ id: 0, time: 0, lane: 0, duration: 1.2 })];
    engine.tap('k:KeyD', null);
    live(engine, 0.48);
    engine.tick();
    expect(kinds).toContain('tick');
    engine.dispose();
  });
});
