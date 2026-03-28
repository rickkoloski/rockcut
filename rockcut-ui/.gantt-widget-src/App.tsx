import { useState, useEffect, useCallback } from 'react';
import { TaskStore, DependencyStore, CalendarStore, ResourceStore, AssignmentStore, BaselineStore } from './stores';
import { TaskModel, DependencyModel, DependencyType, ConstraintType, ResourceModel, ResourceType } from './models';
import type { DependencyType as DepType } from './models';
import { GanttChart, type DraggedDates } from './components';
import { validateAllConstraints, type ConstraintViolation } from './scheduling';

function createSampleTasks(): TaskModel[] {
  return [
    TaskModel.create({
      id: 'p1',
      name: 'Project Alpha',
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 0, 31),
      duration: 30,
      percentDone: 0, // Will be calculated from children
    }),
    TaskModel.create({
      id: 'p1-1',
      name: 'Phase 1: Planning',
      parentId: 'p1',
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 0, 10),
      duration: 10,
      percentDone: 0, // Will be calculated from children
    }),
    TaskModel.create({
      id: 'p1-1-1',
      name: 'Requirements Gathering',
      parentId: 'p1-1',
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 0, 5),
      duration: 5,
      percentDone: 100, // Complete
    }),
    TaskModel.create({
      id: 'p1-1-2',
      name: 'Design Review',
      parentId: 'p1-1',
      startDate: new Date(2026, 0, 6),
      endDate: new Date(2026, 0, 10),
      duration: 5,
      percentDone: 75, // In progress
    }),
    TaskModel.create({
      id: 'p1-2',
      name: 'Phase 2: Development',
      parentId: 'p1',
      startDate: new Date(2026, 0, 11),
      endDate: new Date(2026, 0, 25),
      duration: 15,
      percentDone: 0, // Will be calculated from children
    }),
    TaskModel.create({
      id: 'p1-2-1',
      name: 'Backend Development',
      parentId: 'p1-2',
      startDate: new Date(2026, 0, 11),
      endDate: new Date(2026, 0, 20),
      duration: 10,
      percentDone: 60, // In progress
    }),
    TaskModel.create({
      id: 'p1-2-2',
      name: 'Frontend Development',
      parentId: 'p1-2',
      startDate: new Date(2026, 0, 16),
      endDate: new Date(2026, 0, 25),
      duration: 10,
      percentDone: 30, // Just started
    }),
    TaskModel.create({
      id: 'p1-3',
      name: 'Phase 3: Testing',
      parentId: 'p1',
      startDate: new Date(2026, 0, 26),
      endDate: new Date(2026, 0, 30),
      duration: 5,
      percentDone: 0, // Not started
    }),
    // Task with SNET constraint - meets constraint (starts on Jan 15)
    TaskModel.create({
      id: 'p1-constrained',
      name: 'Constrained Task (SNET)',
      parentId: 'p1',
      startDate: new Date(2026, 0, 15),
      endDate: new Date(2026, 0, 18),
      duration: 4,
      constraintType: ConstraintType.SNET,
      constraintDate: new Date(2026, 0, 15),
    }),
    // Task that VIOLATES its FNLT constraint (finishes after Jan 12)
    TaskModel.create({
      id: 'p1-violated',
      name: 'Violated Task (FNLT)',
      parentId: 'p1',
      startDate: new Date(2026, 0, 10),
      endDate: new Date(2026, 0, 20),
      duration: 11,
      constraintType: ConstraintType.FNLT,
      constraintDate: new Date(2026, 0, 12),
    }),
    TaskModel.createMilestone({
      id: 'p1-m1',
      name: 'Release',
      parentId: 'p1',
      startDate: new Date(2026, 0, 31),
    }),
  ];
}

function createSampleDependencies(): DependencyModel[] {
  return [
    // FS: Requirements → Design
    DependencyModel.createFinishToStart('p1-1-1', 'p1-1-2'),

    // FS: Design → Backend
    DependencyModel.createFinishToStart('p1-1-2', 'p1-2-1'),

    // SS: Backend → Frontend (can start together after backend begins)
    DependencyModel.create({
      fromTask: 'p1-2-1',
      toTask: 'p1-2-2',
      type: DependencyType.StartToStart,
    }),

    // FS: Frontend → Testing
    DependencyModel.createFinishToStart('p1-2-2', 'p1-3'),

    // FS: Testing → Release milestone
    DependencyModel.createFinishToStart('p1-3', 'p1-m1'),

    // FF: Backend ↔ Frontend must finish together
    DependencyModel.create({
      fromTask: 'p1-2-2',
      toTask: 'p1-2-1',
      type: DependencyType.FinishToFinish,
    }),
  ];
}

function App() {
  const [taskStore] = useState(() => new TaskStore());
  const [dependencyStore] = useState(() => new DependencyStore(taskStore));
  const [calendarStore] = useState(() => {
    const store = new CalendarStore();
    // Add some sample holidays
    store.addHoliday(new Date(2026, 0, 1), "New Year's Day");
    store.addHoliday(new Date(2026, 0, 19), 'MLK Day');
    return store;
  });
  const [resourceStore] = useState(() => {
    const store = new ResourceStore();
    // Add sample resources
    store.add(ResourceModel.create({
      id: 'r1',
      name: 'Alice',
      role: 'Developer',
      type: ResourceType.Work,
      maxUnits: 100,
      color: '#3b82f6',
    }));
    store.add(ResourceModel.create({
      id: 'r2',
      name: 'Bob',
      role: 'Designer',
      type: ResourceType.Work,
      maxUnits: 100,
      color: '#10b981',
    }));
    store.add(ResourceModel.create({
      id: 'r3',
      name: 'Charlie',
      role: 'PM',
      type: ResourceType.Work,
      maxUnits: 50, // Part-time
      color: '#f59e0b',
    }));
    return store;
  });
  const [assignmentStore] = useState(() => {
    const store = new AssignmentStore();
    // Assign resources to tasks
    store.assign('p1-1-1', 'r1', 100); // Alice on Requirements
    store.assign('p1-1-1', 'r3', 50);  // Charlie (PM) at 50%
    store.assign('p1-1-2', 'r2', 100); // Bob on Design Review
    store.assign('p1-2-1', 'r1', 100); // Alice on Backend
    store.assign('p1-2-2', 'r2', 100); // Bob on Frontend
    store.assign('p1-3', 'r1', 50);    // Alice at 50% on Testing
    store.assign('p1-3', 'r2', 50);    // Bob at 50% on Testing
    return store;
  });
  const [baselineStore] = useState(() => new BaselineStore());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedDependencyId, setSelectedDependencyId] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [violations, setViolations] = useState<ConstraintViolation[]>([]);
  const [useNewArrows, setUseNewArrows] = useState(true);

  useEffect(() => {
    // Only add sample data if stores are empty (handles React StrictMode double-invocation)
    if (taskStore.isEmpty) {
      taskStore.add(createSampleTasks());
    }
    if (dependencyStore.isEmpty) {
      dependencyStore.add(createSampleDependencies());
    }
  }, [taskStore, dependencyStore]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Task drag handler
  const handleTaskDateChange = useCallback(
    (taskId: string, changes: DraggedDates) => {
      console.log('Task date changed:', taskId, changes);
      // Store is already updated by Timeline, this is for undo/external notifications
    },
    []
  );

  // Dependency callbacks
  const handleDependencyCreate = useCallback(
    (fromId: string, toId: string, type: DepType) => {
      console.log('Dependency created:', fromId, '->', toId, 'type:', type);
    },
    []
  );

  const handleDependencyDelete = useCallback(
    (dependencyId: string) => {
      console.log('Dependency deleted:', dependencyId);
    },
    []
  );

  // Validate all constraints
  const handleValidate = useCallback(() => {
    const allTasks = taskStore.getAll();
    const found = validateAllConstraints(allTasks);
    setViolations(found);
    console.log('Constraint violations:', found);
  }, [taskStore]);

  return (
    <div className="min-h-screen p-4 bg-[var(--color-background)] text-[var(--color-text)]">
      <div className="mb-4 flex items-center gap-4">
        <h1 className="text-xl font-bold">Gantt Widget Demo</h1>
        <button
          onClick={() => setIsDark(!isDark)}
          className="px-3 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]"
        >
          {isDark ? 'Light Mode' : 'Dark Mode'}
        </button>
        <button
          onClick={handleValidate}
          className="px-3 py-1 rounded border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white"
        >
          Validate Constraints
        </button>
        <button
          onClick={() => setUseNewArrows(!useNewArrows)}
          className={`px-3 py-1 rounded border ${
            useNewArrows
              ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
              : 'border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]'
          }`}
        >
          {useNewArrows ? 'New Arrows' : 'Classic Arrows'}
        </button>
      </div>

      <div className="mb-2 text-sm text-[var(--color-text-muted)]">
        Task: {selectedTaskId ?? 'None'} | Dependency: {selectedDependencyId ?? 'None'}
      </div>

      {violations.length > 0 && (
        <div className="mb-4 p-3 rounded border border-red-500 bg-red-50 dark:bg-red-900/20 relative">
          <button
            onClick={() => setViolations([])}
            className="absolute top-2 right-2 p-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200"
            aria-label="Dismiss violations"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          <div className="font-semibold text-red-700 dark:text-red-400 mb-2">
            Constraint Violations ({violations.length}):
          </div>
          <ul className="text-sm space-y-1">
            {violations.map((v) => (
              <li key={v.taskId} className="text-red-600 dark:text-red-300">
                • {v.message} (Task: {v.taskId})
              </li>
            ))}
          </ul>
        </div>
      )}

      <GanttChart
        taskStore={taskStore}
        dependencyStore={dependencyStore}
        calendarStore={calendarStore}
        showNonWorkingDays={true}
        resourceStore={resourceStore}
        assignmentStore={assignmentStore}
        showResourceColumn={true}
        baselineStore={baselineStore}
        showProgressColumn={true}
        showStatusColumn={true}
        showTodayLine={true}
        selectedTaskId={selectedTaskId}
        onTaskSelect={setSelectedTaskId}
        selectedDependencyId={selectedDependencyId}
        onDependencySelect={setSelectedDependencyId}
        onDependencyCreate={handleDependencyCreate}
        onDependencyDelete={handleDependencyDelete}
        useNewDependencyArrows={useNewArrows}
        defaultLeftWidth={840}
        enableDrag={true}
        onTaskDateChange={handleTaskDateChange}
        height={500}
      />
    </div>
  );
}

export default App;
