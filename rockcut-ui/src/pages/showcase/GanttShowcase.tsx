import { useState, useMemo } from 'react'
import { Box, Typography } from '@mui/material'
import PageHeader from '../../components/PageHeader'

// gantt-widget imports — resolved via Vite alias to shared lib source
import { GanttChart } from 'gantt-widget/components'
import { TaskStore } from 'gantt-widget/stores'
import { DependencyStore } from 'gantt-widget/stores'
import { TaskModel, DependencyModel } from 'gantt-widget/models'

// Scoped CSS variables for the gantt-widget (avoids global :root / body conflicts with MUI)
import './gantt-scope.css'

/**
 * Build a Date at a specific hour on a given base date.
 */
function dateAt(base: Date, hour: number): Date {
  const d = new Date(base)
  d.setHours(hour, 0, 0, 0)
  return d
}

/**
 * Add hours to a Date.
 */
function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

/**
 * Add days to a Date.
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/**
 * Create the sample brewing process data.
 *
 * We model a full brew cycle for "Test IPA Batch #001":
 *   - Brew Day (Day 0): Mash, Lauter, Boil, Whirlpool, Chill, Pitch
 *   - Fermentation (Days 1-14): Lag, Active, Conditioning, Diacetyl Rest
 *   - Cold Crash (Days 15-17)
 *   - Packaging (Day 18)
 *
 * The gantt-widget works in day units, so brew-day sub-steps are modeled
 * in fractional days (hours / 24) to render properly on the timeline.
 */
function createBrewingData() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Brew day started 8 days ago (so we're "currently in active fermentation")
  const brewDay = addDays(today, -8)

  // Brew day timeline (6 AM start)
  const mashStart = dateAt(brewDay, 6)
  const strikeStart = dateAt(brewDay, 6)
  const strikeEnd = addHours(strikeStart, 0.5)
  const doughInStart = strikeEnd
  const doughInEnd = addHours(doughInStart, 10 / 60)
  const mashRestStart = doughInEnd
  const mashRestEnd = addHours(mashRestStart, 1)

  const lauterStart = mashRestEnd
  const vorlaufStart = lauterStart
  const vorlaufEnd = addHours(vorlaufStart, 0.25)
  const spargeStart = vorlaufEnd
  const spargeEnd = addHours(spargeStart, 0.5)
  const lauterEnd = spargeEnd

  const boilStart = lauterEnd
  const boilEnd = addHours(boilStart, 1)

  const whirlpoolStart = boilEnd
  const whirlpoolEnd = addHours(whirlpoolStart, 1 / 3)

  const chillStart = whirlpoolEnd
  const chillEnd = addHours(chillStart, 0.5)

  const pitchTime = chillEnd
  const brewDayEnd = dateAt(brewDay, 14) // ~2 PM end

  // Fermentation starts day after brew day
  const fermStart = addDays(brewDay, 1)
  const lagEnd = addDays(fermStart, 1)
  const activeStart = lagEnd
  const activeEnd = addDays(activeStart, 5)
  const conditioningStart = activeEnd
  const conditioningEnd = addDays(conditioningStart, 7)
  const dRestStart = addDays(conditioningEnd, 0) // overlaps slightly
  const dRestEnd = addDays(dRestStart, 2)
  const fermEnd = dRestEnd

  // Cold crash
  const coldCrashStart = fermEnd
  const coldCrashEnd = addDays(coldCrashStart, 3)

  // Packaging
  const packagingStart = coldCrashEnd
  const transferStart = packagingStart
  const transferEnd = addHours(transferStart, 2)
  const carbonateStart = transferEnd
  const carbonateEnd = addHours(carbonateStart, 4)
  const packageStart = carbonateEnd
  const packageEnd = addHours(packageStart, 3)
  const packagingEnd = addDays(packagingStart, 1)

  // ---- Tasks ----
  const tasks: TaskModel[] = [
    // Phase 1: Brew Day (parent)
    TaskModel.create({
      id: 'brew-day',
      name: 'Brew Day',
      startDate: mashStart,
      endDate: brewDayEnd,
      duration: 1,
      durationUnit: 'day',
      percentDone: 100,
      expanded: true,
    }),

    // Mash phase (parent)
    TaskModel.create({
      id: 'mash',
      name: 'Mash',
      parentId: 'brew-day',
      startDate: mashStart,
      endDate: mashRestEnd,
      duration: 1,
      durationUnit: 'day',
      percentDone: 100,
      expanded: true,
    }),
    TaskModel.create({
      id: 'strike-water',
      name: 'Heat Strike Water',
      parentId: 'mash',
      startDate: strikeStart,
      endDate: strikeEnd,
      duration: 1,
      durationUnit: 'day',
      percentDone: 100,
    }),
    TaskModel.create({
      id: 'dough-in',
      name: 'Dough In',
      parentId: 'mash',
      startDate: doughInStart,
      endDate: doughInEnd,
      duration: 1,
      durationUnit: 'day',
      percentDone: 100,
    }),
    TaskModel.create({
      id: 'mash-rest',
      name: 'Mash Rest (152\u00B0F)',
      parentId: 'mash',
      startDate: mashRestStart,
      endDate: mashRestEnd,
      duration: 1,
      durationUnit: 'day',
      percentDone: 100,
    }),

    // Lauter phase (parent)
    TaskModel.create({
      id: 'lauter',
      name: 'Lauter',
      parentId: 'brew-day',
      startDate: lauterStart,
      endDate: lauterEnd,
      duration: 1,
      durationUnit: 'day',
      percentDone: 100,
      expanded: true,
    }),
    TaskModel.create({
      id: 'vorlauf',
      name: 'Vorlauf',
      parentId: 'lauter',
      startDate: vorlaufStart,
      endDate: vorlaufEnd,
      duration: 1,
      durationUnit: 'day',
      percentDone: 100,
    }),
    TaskModel.create({
      id: 'sparge',
      name: 'Sparge',
      parentId: 'lauter',
      startDate: spargeStart,
      endDate: spargeEnd,
      duration: 1,
      durationUnit: 'day',
      percentDone: 100,
    }),

    // Boil phase
    TaskModel.create({
      id: 'boil',
      name: 'Boil (60 min)',
      parentId: 'brew-day',
      startDate: boilStart,
      endDate: boilEnd,
      duration: 1,
      durationUnit: 'day',
      percentDone: 100,
      expanded: true,
    }),
    TaskModel.create({
      id: 'hop-60',
      name: 'Bittering Hops (60 min)',
      parentId: 'boil',
      startDate: boilStart,
      endDate: boilStart,
      duration: 0,
      milestone: true,
      percentDone: 100,
    }),
    TaskModel.create({
      id: 'hop-5',
      name: 'Aroma Hops (5 min)',
      parentId: 'boil',
      startDate: addHours(boilStart, 55 / 60),
      endDate: addHours(boilStart, 55 / 60),
      duration: 0,
      milestone: true,
      percentDone: 100,
    }),

    // Post-boil
    TaskModel.create({
      id: 'whirlpool',
      name: 'Whirlpool / Hop Stand',
      parentId: 'brew-day',
      startDate: whirlpoolStart,
      endDate: whirlpoolEnd,
      duration: 1,
      durationUnit: 'day',
      percentDone: 100,
    }),
    TaskModel.create({
      id: 'chill',
      name: 'Chill to Pitch Temp',
      parentId: 'brew-day',
      startDate: chillStart,
      endDate: chillEnd,
      duration: 1,
      durationUnit: 'day',
      percentDone: 100,
    }),
    TaskModel.create({
      id: 'pitch',
      name: 'Pitch Yeast',
      parentId: 'brew-day',
      startDate: pitchTime,
      endDate: pitchTime,
      duration: 0,
      milestone: true,
      percentDone: 100,
    }),

    // Phase 2: Fermentation (parent)
    TaskModel.create({
      id: 'fermentation',
      name: 'Fermentation',
      startDate: fermStart,
      endDate: fermEnd,
      duration: 14,
      durationUnit: 'day',
      percentDone: 45,
      expanded: true,
    }),
    TaskModel.create({
      id: 'lag-phase',
      name: 'Lag Phase',
      parentId: 'fermentation',
      startDate: fermStart,
      endDate: lagEnd,
      duration: 1,
      durationUnit: 'day',
      percentDone: 100,
    }),
    TaskModel.create({
      id: 'active-ferm',
      name: 'Active Fermentation',
      parentId: 'fermentation',
      startDate: activeStart,
      endDate: activeEnd,
      duration: 5,
      durationUnit: 'day',
      percentDone: 60,
    }),
    TaskModel.create({
      id: 'conditioning',
      name: 'Conditioning',
      parentId: 'fermentation',
      startDate: conditioningStart,
      endDate: conditioningEnd,
      duration: 7,
      durationUnit: 'day',
      percentDone: 0,
    }),
    TaskModel.create({
      id: 'd-rest',
      name: 'Diacetyl Rest',
      parentId: 'fermentation',
      startDate: dRestStart,
      endDate: dRestEnd,
      duration: 2,
      durationUnit: 'day',
      percentDone: 0,
    }),

    // Phase 3: Cold Crash
    TaskModel.create({
      id: 'cold-crash',
      name: 'Cold Crash',
      startDate: coldCrashStart,
      endDate: coldCrashEnd,
      duration: 3,
      durationUnit: 'day',
      percentDone: 0,
    }),

    // Phase 4: Packaging (parent)
    TaskModel.create({
      id: 'packaging',
      name: 'Packaging',
      startDate: packagingStart,
      endDate: packagingEnd,
      duration: 1,
      durationUnit: 'day',
      percentDone: 0,
      expanded: true,
    }),
    TaskModel.create({
      id: 'transfer',
      name: 'Transfer to Brite',
      parentId: 'packaging',
      startDate: transferStart,
      endDate: transferEnd,
      duration: 1,
      durationUnit: 'day',
      percentDone: 0,
    }),
    TaskModel.create({
      id: 'carbonate',
      name: 'Force Carbonate',
      parentId: 'packaging',
      startDate: carbonateStart,
      endDate: carbonateEnd,
      duration: 1,
      durationUnit: 'day',
      percentDone: 0,
    }),
    TaskModel.create({
      id: 'package',
      name: 'Package (Kegs/Cans)',
      parentId: 'packaging',
      startDate: packageStart,
      endDate: packageEnd,
      duration: 1,
      durationUnit: 'day',
      percentDone: 0,
    }),
  ]

  // ---- Dependencies (Finish-to-Start) ----
  const dependencies: DependencyModel[] = [
    // Mash sequence
    DependencyModel.createFinishToStart('strike-water', 'dough-in'),
    DependencyModel.createFinishToStart('dough-in', 'mash-rest'),

    // Mash -> Lauter
    DependencyModel.createFinishToStart('mash', 'lauter'),

    // Lauter sequence
    DependencyModel.createFinishToStart('vorlauf', 'sparge'),

    // Lauter -> Boil
    DependencyModel.createFinishToStart('lauter', 'boil'),

    // Boil -> post-boil
    DependencyModel.createFinishToStart('boil', 'whirlpool'),
    DependencyModel.createFinishToStart('whirlpool', 'chill'),
    DependencyModel.createFinishToStart('chill', 'pitch'),

    // Pitch -> Fermentation
    DependencyModel.createFinishToStart('pitch', 'fermentation'),

    // Fermentation internal sequence
    DependencyModel.createFinishToStart('lag-phase', 'active-ferm'),
    DependencyModel.createFinishToStart('active-ferm', 'conditioning'),

    // Fermentation -> Cold Crash
    DependencyModel.createFinishToStart('fermentation', 'cold-crash'),

    // Cold Crash -> Packaging
    DependencyModel.createFinishToStart('cold-crash', 'packaging'),

    // Packaging internal sequence
    DependencyModel.createFinishToStart('transfer', 'carbonate'),
    DependencyModel.createFinishToStart('carbonate', 'package'),
  ]

  return { tasks, dependencies }
}

export default function GanttShowcase() {
  // Selection state
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedDependencyId, setSelectedDependencyId] = useState<string | null>(null)

  // Build stores once
  const { taskStore, dependencyStore } = useMemo(() => {
    const { tasks, dependencies } = createBrewingData()

    const ts = new TaskStore()
    ts.add(tasks)

    const ds = new DependencyStore(ts)
    ds.add(dependencies)

    return { taskStore: ts, dependencyStore: ds }
  }, [])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)' }}>
      <PageHeader
        breadcrumbs={[
          { label: 'Showcase', to: '/showcase' },
          { label: 'Gantt Chart' },
        ]}
        title="Process Tracking: Gantt View"
      />

      <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 1 }}>
        Test IPA — Batch #001
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        This view shows a brewing process as a time-based schedule. Each phase has planned
        durations and dependencies. Progress bars show actual completion. The brew day happened
        8 days ago and fermentation is currently in progress.
      </Typography>

      <Box sx={{ flexGrow: 1, minHeight: 0 }} className="gantt-scope">
        <GanttChart
          taskStore={taskStore}
          dependencyStore={dependencyStore}
          selectedTaskId={selectedTaskId}
          onTaskSelect={setSelectedTaskId}
          selectedDependencyId={selectedDependencyId}
          onDependencySelect={setSelectedDependencyId}
          showProgressColumn={true}
          showStatusColumn={true}
          showTodayLine={true}
          enableDrag={true}
          showCrudToolbar={false}
          defaultPixelsPerDay={30}
          height="100%"
        />
      </Box>
    </Box>
  )
}
