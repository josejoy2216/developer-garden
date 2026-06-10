// Achievements & wildlife — purely additive. Nothing here can ever be lost.

import { Achievement, GardenState, WildlifeDef, dayKey } from './types';

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-seed', title: 'First Seed', detail: 'Opened your first project.', reward: 'A garden path appears' },
  { id: 'first-commit', title: 'First Commit', detail: 'Your first commit took root.', reward: 'A white daisy' },
  { id: 'streak-7', title: 'Seven Days of Sun', detail: 'Active 7 days in a row.', reward: 'A bed of marigolds' },
  { id: 'streak-30', title: 'A Month in Bloom', detail: 'Active 30 days in a row.', reward: 'A stone lantern' },
  { id: 'commits-100', title: 'A Hundred Rings', detail: '100 commits across your garden.', reward: 'A rose bush' },
  { id: 'commits-1000', title: 'Old Growth', detail: '1,000 commits. A forest remembers.', reward: 'A wooden bench' },
  { id: 'projects-5', title: 'Grove Keeper', detail: 'Five projects planted.', reward: 'A small pond' },
  { id: 'skills-5', title: 'Polyglot Meadow', detail: 'Five skills growing at once.', reward: 'Wildflowers' },
  { id: 'first-mature', title: 'Canopy', detail: 'A plant reached its mature form.', reward: 'Fireflies at dusk' },
  { id: 'year-one', title: 'Four Seasons', detail: 'One year since your first seed.', reward: 'A garden archway' }
];

export const WILDLIFE: WildlifeDef[] = [
  { id: 'butterfly', name: 'Butterfly', hint: 'Drawn to gardens with steady commits.' },
  { id: 'bee', name: 'Bee', hint: 'Visits gardens tended on many days.' },
  { id: 'bird', name: 'Bird', hint: 'Nests where hundreds of commits have grown.' },
  { id: 'squirrel', name: 'Squirrel', hint: 'Appears in gardens with many trees.' },
  { id: 'fox', name: 'Fox', hint: 'Seen only by the most consistent gardeners.' },
  { id: 'owl', name: 'Owl', hint: 'Watches over gardens a year old.' }
];

export function currentStreak(state: GardenState): number {
  const days = new Set(state.totals.activeDays);
  let streak = 0;
  const cursor = new Date();
  // Today counts if active; otherwise start from yesterday (a streak isn't
  // broken just because today isn't over yet).
  if (!days.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Returns titles of anything newly unlocked, and records them in state. */
export function evaluateUnlocks(state: GardenState, anyMature: boolean): string[] {
  const unlocked: string[] = [];
  const now = Date.now();
  const streak = currentStreak(state);
  const projectCount = Object.keys(state.projects).length;
  const skillCount = Object.keys(state.skills).length;
  const activeDayCount = state.totals.activeDays.length;
  const ageDays = (now - state.createdAt) / 86400000;

  const achievementMet: Record<string, boolean> = {
    'first-seed': projectCount >= 1,
    'first-commit': state.totals.commits >= 1,
    'streak-7': streak >= 7,
    'streak-30': streak >= 30,
    'commits-100': state.totals.commits >= 100,
    'commits-1000': state.totals.commits >= 1000,
    'projects-5': projectCount >= 5,
    'skills-5': skillCount >= 5,
    'first-mature': anyMature,
    'year-one': ageDays >= 365 && activeDayCount >= 50
  };

  for (const a of ACHIEVEMENTS) {
    if (achievementMet[a.id] && !state.achievements[a.id]) {
      state.achievements[a.id] = now;
      unlocked.push(`🏵 ${a.title} — ${a.reward.toLowerCase()}`);
    }
  }

  const wildlifeMet: Record<string, boolean> = {
    butterfly: state.totals.commits >= 50,
    bee: activeDayCount >= 30,
    bird: state.totals.commits >= 500,
    squirrel: projectCount >= 5,
    fox: streak >= 30,
    owl: ageDays >= 365 && activeDayCount >= 100
  };

  for (const w of WILDLIFE) {
    if (wildlifeMet[w.id] && !state.wildlife[w.id]) {
      state.wildlife[w.id] = now;
      unlocked.push(`🦋 A ${w.name.toLowerCase()} has moved into your garden`);
    }
  }

  return unlocked;
}
