/*
  Supabase sync layer — all operations are fire-and-forget on writes.
  Run this SQL in the Supabase SQL editor once to create the tables:

  create table profiles (
    user_id text primary key,
    anthropic_api_key text default '',
    phase text,
    targets jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );

  create table workouts (
    id text primary key,
    user_id text not null,
    date text not null,
    split text,
    exercises jsonb default '[]',
    notes text,
    created_at timestamptz default now()
  );

  create table nutrition (
    id text primary key,
    user_id text not null,
    day_key text not null,
    meals jsonb default '[]',
    is_training boolean default false,
    targets_snapshot jsonb,
    created_at timestamptz default now()
  );

  create table body_weights (
    id text primary key,
    user_id text not null,
    date text not null,
    weight numeric not null,
    created_at timestamptz default now()
  );

  create table builder_chat (
    user_id text primary key,
    messages jsonb default '[]',
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );

  alter table profiles     enable row level security;
  alter table workouts     enable row level security;
  alter table nutrition    enable row level security;
  alter table body_weights enable row level security;
  alter table builder_chat enable row level security;

  create policy "open" on profiles     for all using (true) with check (true);
  create policy "open" on workouts     for all using (true) with check (true);
  create policy "open" on nutrition    for all using (true) with check (true);
  create policy "open" on body_weights for all using (true) with check (true);
  create policy "open" on builder_chat for all using (true) with check (true);
*/

import { supabase, getUserId } from './supabase';

// ── Profile ──────────────────────────────────────────────

export async function pushProfile(profile, apiKey) {
  try {
    await supabase.from('profiles').upsert({
      user_id: getUserId(),
      anthropic_api_key: apiKey || '',
      phase: profile.phase,
      targets: {
        currentWeight: profile.currentWeight,
        goalMin: profile.goalMin,
        goalMax: profile.goalMax,
        trainingTargets: profile.trainingTargets,
        restTargets: profile.restTargets,
      },
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[db] pushProfile:', e.message);
  }
}

// ── Workouts ─────────────────────────────────────────────

export async function pushWorkout(workout) {
  try {
    await supabase.from('workouts').upsert({
      id: workout.id,
      user_id: getUserId(),
      date: workout.date,
      split: workout.split || null,
      exercises: workout.exercises,
      notes: workout.notes || null,
    });
  } catch (e) {
    console.warn('[db] pushWorkout:', e.message);
  }
}

export async function deleteSupabaseWorkout(id) {
  try {
    await supabase.from('workouts').delete().eq('id', id);
  } catch (e) {
    console.warn('[db] deleteWorkout:', e.message);
  }
}

export async function deleteWorkoutsByDate(date) {
  try {
    await supabase.from('workouts').delete().eq('user_id', getUserId()).eq('date', date);
  } catch (e) {
    console.warn('[db] deleteWorkoutsByDate:', e.message);
  }
}

// ── Nutrition / Active Day ────────────────────────────────

export async function pushNutritionDay(dayKey, meals, isTraining, snapshot = null) {
  try {
    await supabase.from('nutrition').upsert({
      id: `${getUserId()}_${dayKey}`,
      user_id: getUserId(),
      day_key: dayKey,
      meals,
      is_training: !!isTraining,
      targets_snapshot: snapshot,
    });
  } catch (e) {
    console.warn('[db] pushNutritionDay:', e.message);
  }
}

export async function pushActiveDay(active) {
  await pushNutritionDay('active', active.meals, active.isTraining, { active_date: active.date });
}

// ── Body weights ──────────────────────────────────────────

export async function pushBodyWeight(entry) {
  try {
    await supabase.from('body_weights').upsert({
      id: `${getUserId()}_${entry.date}`,
      user_id: getUserId(),
      date: entry.date,
      weight: entry.weight,
    });
  } catch (e) {
    console.warn('[db] pushBodyWeight:', e.message);
  }
}

export async function deleteSupabaseBodyWeight(date) {
  try {
    await supabase.from('body_weights').delete().eq('user_id', getUserId()).eq('date', date);
  } catch (e) {
    console.warn('[db] deleteBodyWeight:', e.message);
  }
}

// ── Builder chat ──────────────────────────────────────────

export async function pushBuilderChat(messages) {
  try {
    await supabase.from('builder_chat').upsert({
      user_id: getUserId(),
      messages,
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[db] pushBuilderChat:', e.message);
  }
}

// ── Initial pull — called once on app start ───────────────

export async function pullAll() {
  const uid = getUserId();

  const [
    { data: profileRow },
    { data: workoutRows },
    { data: nutritionRows },
    { data: weightRows },
    { data: chatRow },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', uid).maybeSingle(),
    supabase.from('workouts').select('*').eq('user_id', uid).order('date', { ascending: false }),
    supabase.from('nutrition').select('*').eq('user_id', uid),
    supabase.from('body_weights').select('*').eq('user_id', uid).order('date', { ascending: false }),
    supabase.from('builder_chat').select('*').eq('user_id', uid).maybeSingle(),
  ]);

  // Profile
  if (profileRow?.targets) {
    const { currentWeight, goalMin, goalMax, trainingTargets, restTargets } = profileRow.targets;
    const existing = JSON.parse(localStorage.getItem('gainz_profile') || '{}');
    localStorage.setItem('gainz_profile', JSON.stringify({
      ...existing,
      ...(currentWeight  !== undefined && { currentWeight }),
      ...(goalMin        !== undefined && { goalMin }),
      ...(goalMax        !== undefined && { goalMax }),
      ...(trainingTargets               && { trainingTargets }),
      ...(restTargets                   && { restTargets }),
      ...(profileRow.phase              && { phase: profileRow.phase }),
    }));
    if (profileRow.anthropic_api_key) {
      localStorage.setItem('gainz_api_key', profileRow.anthropic_api_key);
    }
  }

  // Workouts
  if (workoutRows?.length) {
    const mapped = workoutRows.map(w => ({
      id: w.id,
      date: w.date,
      split: w.split,
      exercises: w.exercises || [],
      notes: w.notes || '',
    }));
    localStorage.setItem('gainz_workouts', JSON.stringify(mapped));
  }

  // Nutrition — active day + completed days
  if (nutritionRows?.length) {
    const activeRow     = nutritionRows.find(n => n.day_key === 'active');
    const completedRows = nutritionRows.filter(n => n.day_key !== 'active');

    if (activeRow) {
      localStorage.setItem('gainz_active_day', JSON.stringify({
        date: activeRow.targets_snapshot?.active_date || new Date().toISOString().slice(0, 10),
        meals: activeRow.meals || [],
        isTraining: !!activeRow.is_training,
      }));
    }

    if (completedRows.length) {
      const map = {};
      completedRows.forEach(n => {
        map[n.day_key] = { meals: n.meals || [], isTraining: !!n.is_training };
      });
      localStorage.setItem('gainz_nutrition', JSON.stringify(map));
    }
  }

  // Body weights
  if (weightRows?.length) {
    const mapped = weightRows.map(w => ({
      id: `${uid}_${w.date}`,
      date: w.date,
      weight: w.weight,
    }));
    localStorage.setItem('gainz_bodyweight', JSON.stringify(mapped));
  }

  // Builder chat
  if (chatRow?.messages?.length) {
    localStorage.setItem('gainz_builder_chat', JSON.stringify(chatRow.messages));
  }
}
