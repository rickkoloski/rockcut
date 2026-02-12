import { useState } from 'react'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Avatar,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  ButtonGroup,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Fab,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  LinearProgress,
  Link,
  MenuItem,
  Paper,
  Rating,
  Select,
  Slider,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import { type GridColDef } from '@mui/x-data-grid'
import { DataGridExtended } from 'datagrid-extended'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import AddIcon from '@mui/icons-material/Add'
import LocalDrinkIcon from '@mui/icons-material/LocalDrink'
import GrainIcon from '@mui/icons-material/Grain'
import SpaIcon from '@mui/icons-material/Spa'
import BubbleChartIcon from '@mui/icons-material/BubbleChart'

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Paper elevation={0} sx={{ p: 3, mb: 3, border: '1px solid', borderColor: 'divider' }}>
      <Typography variant="h6" gutterBottom>{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{description}</Typography>
      {children}
    </Paper>
  )
}

// --- Data Grid Section ---
function DataGridSection() {
  const columns: GridColDef[] = [
    { field: 'ingredient', headerName: 'Ingredient', width: 180, editable: true },
    { field: 'type', headerName: 'Type', width: 120 },
    { field: 'quantity', headerName: 'Qty', width: 90, type: 'number', editable: true },
    { field: 'unit', headerName: 'Unit', width: 80 },
    { field: 'time', headerName: 'Time (min)', width: 100, type: 'number', editable: true },
    { field: 'notes', headerName: 'Notes', flex: 1, editable: true },
  ]

  const rows = [
    { id: 1, ingredient: '2-Row Pale Malt', type: 'Grain', quantity: 10, unit: 'lb', time: 60, notes: 'Base malt' },
    { id: 2, ingredient: 'Crystal 40L', type: 'Grain', quantity: 1, unit: 'lb', time: 60, notes: 'Caramel sweetness' },
    { id: 3, ingredient: 'Cascade', type: 'Hop', quantity: 1.5, unit: 'oz', time: 60, notes: 'Bittering' },
    { id: 4, ingredient: 'Centennial', type: 'Hop', quantity: 1.0, unit: 'oz', time: 15, notes: 'Flavor' },
    { id: 5, ingredient: 'Citra', type: 'Hop', quantity: 0.5, unit: 'oz', time: 0, notes: 'Aroma / flameout' },
    { id: 6, ingredient: 'US-05', type: 'Yeast', quantity: 1, unit: 'pkg', time: 0, notes: 'Clean american ale' },
  ]

  return (
    <Section title="Data Grid (Editable)" description="Excel-like editable grid via datagrid-extended. Click cells to edit. This is the core component for recipe building.">
      <DataGridExtended rows={rows} columns={columns} autoHeight disableRowSelectionOnClick />
    </Section>
  )
}

// --- Table Section ---
function TableSection() {
  const batches = [
    { id: 'B001', recipe: 'Rockcut IPA', date: '2025-01-15', og: 1.064, fg: 1.011, abv: '7.0%', status: 'Completed' },
    { id: 'B002', recipe: 'Granite Stout', date: '2025-01-22', og: 1.049, fg: 1.013, abv: '4.7%', status: 'Fermenting' },
    { id: 'B003', recipe: 'Shield Wheat', date: '2025-02-01', og: 1.051, fg: null, abv: '-', status: 'Planned' },
  ]

  return (
    <Section title="Standard Table" description="Simple read-only tables for batch logs, summaries, and reports.">
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Batch</TableCell>
              <TableCell>Recipe</TableCell>
              <TableCell>Brew Date</TableCell>
              <TableCell align="right">OG</TableCell>
              <TableCell align="right">FG</TableCell>
              <TableCell align="right">ABV</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {batches.map((b) => (
              <TableRow key={b.id} hover>
                <TableCell>{b.id}</TableCell>
                <TableCell>{b.recipe}</TableCell>
                <TableCell>{b.date}</TableCell>
                <TableCell align="right">{b.og}</TableCell>
                <TableCell align="right">{b.fg ?? '-'}</TableCell>
                <TableCell align="right">{b.abv}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={b.status}
                    color={b.status === 'Completed' ? 'success' : b.status === 'Fermenting' ? 'warning' : 'default'}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Section>
  )
}

// --- Forms Section ---
function FormsSection() {
  const [mashTemp, setMashTemp] = useState<number>(152)
  const [boilTime, setBoilTime] = useState('')
  const [batchMethod, setBatchMethod] = useState('allgrain')

  return (
    <Section title="Forms & Inputs" description="Text fields, selects, sliders, toggles — for recipe entry, brew day logging, and settings.">
      <Stack spacing={3}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField label="Recipe Name" defaultValue="Rockcut IPA" fullWidth />
          <TextField label="Style" defaultValue="American IPA" fullWidth />
          <TextField label="Batch Size" defaultValue="5" type="number" sx={{ width: 140 }} />
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
          <FormControl sx={{ minWidth: 160 }}>
            <InputLabel>Boil Time</InputLabel>
            <Select value={boilTime} label="Boil Time" onChange={(e) => setBoilTime(e.target.value)}>
              <MenuItem value="30">30 min</MenuItem>
              <MenuItem value="60">60 min</MenuItem>
              <MenuItem value="90">90 min</MenuItem>
            </Select>
          </FormControl>

          <ToggleButtonGroup
            value={batchMethod}
            exclusive
            onChange={(_e, v) => v && setBatchMethod(v)}
            size="small"
          >
            <ToggleButton value="allgrain">All Grain</ToggleButton>
            <ToggleButton value="extract">Extract</ToggleButton>
            <ToggleButton value="biab">BIAB</ToggleButton>
          </ToggleButtonGroup>

          <FormControlLabel control={<Switch defaultChecked />} label="Auto-calc IBU" />
        </Stack>

        <Box>
          <Typography variant="body2" gutterBottom>
            Mash Temperature: {mashTemp}°F
          </Typography>
          <Slider
            value={mashTemp}
            onChange={(_e, v) => setMashTemp(v as number)}
            min={140}
            max={165}
            marks={[
              { value: 148, label: '148°F (dry)' },
              { value: 152, label: '152°F' },
              { value: 158, label: '158°F (full)' },
            ]}
            valueLabelDisplay="auto"
          />
        </Box>

        <Autocomplete
          multiple
          options={['Cascade', 'Centennial', 'Citra', 'Mosaic', 'Simcoe', 'Amarillo', 'Galaxy', 'Nelson Sauvin']}
          defaultValue={['Cascade', 'Citra']}
          renderInput={(params) => <TextField {...params} label="Hop Additions" />}
        />
      </Stack>
    </Section>
  )
}

// --- Stepper Section ---
function StepperSection() {
  const [activeStep, setActiveStep] = useState(2)
  const steps = ['Mash In', 'Mash Rest', 'Vorlauf', 'Sparge', 'Boil', 'Whirlpool', 'Chill', 'Pitch Yeast']

  return (
    <Section title="Process Stepper" description="Step-by-step brew day workflow. Click steps to navigate.">
      <Stepper activeStep={activeStep} alternativeLabel>
        {steps.map((label, i) => (
          <Step key={label} completed={i < activeStep}>
            <StepLabel
              onClick={() => setActiveStep(i)}
              sx={{ cursor: 'pointer' }}
            >
              {label}
            </StepLabel>
          </Step>
        ))}
      </Stepper>
      <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 2 }}>
        <Button
          variant="outlined"
          size="small"
          disabled={activeStep === 0}
          onClick={() => setActiveStep((s) => s - 1)}
        >
          Back
        </Button>
        <Button
          variant="contained"
          size="small"
          disabled={activeStep === steps.length - 1}
          onClick={() => setActiveStep((s) => s + 1)}
        >
          Next Step
        </Button>
      </Stack>
    </Section>
  )
}

// --- Cards & Chips Section ---
function CardsSection() {
  const ingredients = [
    { name: '2-Row Pale', type: 'Grain', icon: <GrainIcon />, color: '#D4A017' as const },
    { name: 'Crystal 40L', type: 'Grain', icon: <GrainIcon />, color: '#8B4513' as const },
    { name: 'Cascade', type: 'Hop', icon: <SpaIcon />, color: '#4CAF50' as const },
    { name: 'Citra', type: 'Hop', icon: <SpaIcon />, color: '#66BB6A' as const },
    { name: 'US-05', type: 'Yeast', icon: <BubbleChartIcon />, color: '#FF9800' as const },
  ]

  return (
    <Section title="Cards, Chips & Badges" description="Ingredient cards, status chips, category badges — for visual recipe building and dashboards.">
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        {ingredients.map((ing) => (
          <Chip
            key={ing.name}
            icon={ing.icon}
            label={`${ing.name} (${ing.type})`}
            onDelete={() => {}}
            sx={{ '& .MuiChip-icon': { color: ing.color } }}
          />
        ))}
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <Card elevation={0} sx={{ flex: 1, border: '1px solid', borderColor: 'divider' }}>
          <CardContent>
            <Stack direction="row" spacing={2} alignItems="center">
              <Badge badgeContent={3} color="secondary">
                <Avatar sx={{ bgcolor: 'primary.main' }}><LocalDrinkIcon /></Avatar>
              </Badge>
              <Box>
                <Typography variant="subtitle1">Rockcut IPA</Typography>
                <Typography variant="body2" color="text.secondary">3 batches brewed</Typography>
                <Rating value={4} size="small" readOnly sx={{ mt: 0.5 }} />
              </Box>
            </Stack>
          </CardContent>
        </Card>
        <Card elevation={0} sx={{ flex: 1, border: '1px solid', borderColor: 'divider' }}>
          <CardContent>
            <Stack direction="row" spacing={2} alignItems="center">
              <Badge badgeContent={1} color="secondary">
                <Avatar sx={{ bgcolor: 'primary.dark' }}><LocalDrinkIcon /></Avatar>
              </Badge>
              <Box>
                <Typography variant="subtitle1">Granite Stout</Typography>
                <Typography variant="body2" color="text.secondary">1 batch brewed</Typography>
                <Rating value={5} size="small" readOnly sx={{ mt: 0.5 }} />
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Section>
  )
}

// --- Alerts, Progress, Breadcrumbs ---
function FeedbackSection() {
  return (
    <Section title="Feedback & Navigation" description="Alerts, progress bars, breadcrumbs, tabs — for brew day status, fermentation progress, and navigation.">
      <Stack spacing={2}>
        <Alert severity="info">Batch B002 — Fermenting. Current gravity: 1.024. Estimated 3 days remaining.</Alert>
        <Alert severity="success">Batch B001 — Completed. Final ABV: 7.0%. Efficiency: 72%.</Alert>
        <Alert severity="warning">Low inventory: Cascade hops — 2 oz remaining (need 4 oz for next batch).</Alert>

        <Box>
          <Typography variant="body2" gutterBottom>Fermentation Progress (B002)</Typography>
          <LinearProgress variant="determinate" value={65} sx={{ height: 10, borderRadius: 5 }} />
          <Typography variant="caption" color="text.secondary">65% — Day 8 of ~12</Typography>
        </Box>

        <Breadcrumbs>
          <Link underline="hover" color="inherit" href="#">Recipes</Link>
          <Link underline="hover" color="inherit" href="#">Rockcut IPA</Link>
          <Typography color="text.primary">Batch B001</Typography>
        </Breadcrumbs>
      </Stack>
    </Section>
  )
}

// --- Accordion ---
function AccordionSection() {
  return (
    <Section title="Accordion / Collapsible" description="Expandable sections for recipe details, brew notes, and water chemistry panels.">
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle1">Grain Bill</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant="body2">10 lb 2-Row Pale Malt, 1 lb Crystal 40L, 0.5 lb Munich</Typography>
        </AccordionDetails>
      </Accordion>
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle1">Hop Schedule</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant="body2">1.5 oz Cascade @ 60 min, 1 oz Centennial @ 15 min, 0.5 oz Citra @ flameout</Typography>
        </AccordionDetails>
      </Accordion>
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle1">Water Chemistry</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant="body2">Ca: 75ppm, Mg: 5ppm, SO4: 150ppm, Cl: 50ppm, Na: 10ppm — Target: Hoppy pale ale</Typography>
        </AccordionDetails>
      </Accordion>
    </Section>
  )
}

// --- Tabs ---
function TabsSection() {
  const [tab, setTab] = useState(0)

  return (
    <Section title="Tabs" description="Tab navigation for recipe views, batch history, and analytics panels.">
      <Tabs value={tab} onChange={(_e, v) => setTab(v)}>
        <Tab label="Recipe" />
        <Tab label="Brew Log" />
        <Tab label="Fermentation" />
        <Tab label="Tasting Notes" />
      </Tabs>
      <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1, mt: 1 }}>
        {tab === 0 && <Typography variant="body2">Recipe details, grain bill, hop schedule, yeast, and water profile would go here.</Typography>}
        {tab === 1 && <Typography variant="body2">Brew day log with timestamps, gravity readings, and process notes.</Typography>}
        {tab === 2 && <Typography variant="body2">Fermentation chart with temperature and gravity readings over time.</Typography>}
        {tab === 3 && <Typography variant="body2">Appearance, aroma, flavor, mouthfeel, and overall impression.</Typography>}
      </Box>
    </Section>
  )
}

// --- Buttons & Actions ---
function ActionsSection() {
  return (
    <Section title="Buttons & Actions" description="Action buttons, FABs, icon buttons, and button groups for common operations.">
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button variant="contained">New Recipe</Button>
          <Button variant="contained" color="secondary">Start Brew Day</Button>
          <Button variant="outlined">Import BeerJSON</Button>
          <Button variant="outlined" color="error">Delete Batch</Button>
          <Button variant="text">View History</Button>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <ButtonGroup variant="outlined" size="small">
            <Button>Gallons</Button>
            <Button>Liters</Button>
          </ButtonGroup>
          <Tooltip title="Add ingredient">
            <Fab size="small" color="secondary"><AddIcon /></Fab>
          </Tooltip>
          <Tooltip title="Quick add hop">
            <IconButton color="primary"><SpaIcon /></IconButton>
          </Tooltip>
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Checkbox defaultChecked />
          <FormControlLabel control={<Checkbox />} label="Track cost" />
          <FormControlLabel control={<Checkbox defaultChecked />} label="Auto-deduct inventory" />
        </Stack>
      </Stack>
    </Section>
  )
}

// --- Main Showcase ---
export default function ComponentShowcase() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        UI Component Palette
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        A showcase of available UI components for building the Rockcut app.
        Everything here is interactive — click, type, slide, and explore.
      </Typography>

      <DataGridSection />
      <FormsSection />
      <StepperSection />
      <TableSection />
      <CardsSection />
      <TabsSection />
      <AccordionSection />
      <FeedbackSection />
      <ActionsSection />
    </Box>
  )
}
