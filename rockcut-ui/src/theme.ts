// D43: Hop Field (light) and Hop Field Night (dark).
import { createTheme, type Theme, type ThemeOptions } from '@mui/material'

declare module '@mui/material/styles' {
  interface TypeBackground {
    // Task boards: columns sit a step below the page, today's column a step
    // further, cards a step above.
    boardColumn: string
    boardToday: string
    boardCard: string
  }
}

const base: ThemeOptions = {
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: { fontWeight: 700 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
  },
  shape: { borderRadius: 8 },
}

const HOP_GREEN_NIGHT = '#8DBF6A'

const light: ThemeOptions = {
  palette: {
    mode: 'light',
    primary: { main: '#2F5A20', light: '#4E7A3B', dark: '#1F3F14' },
    secondary: { main: '#C99A2E', light: '#DDB75A', dark: '#9C7520' },
    background: { default: '#EEF2E8', paper: '#FFFFFF', boardColumn: '#E1E8D7', boardToday: '#D4E2C5', boardCard: '#FFFFFF' },
    text: { primary: '#172014' },
  },
  components: {
    MuiDrawer: { styleOverrides: { paper: { backgroundColor: '#E6ECDD' } } },
  },
}

const dark: ThemeOptions = {
  palette: {
    mode: 'dark',
    primary: { main: HOP_GREEN_NIGHT, light: '#A9D488', dark: '#6E9C4F', contrastText: '#0F1A0A' },
    secondary: { main: '#D3A640', light: '#E2BE6A', dark: '#A88128' },
    background: { default: '#151915', paper: '#1F241E', boardColumn: '#20271E', boardToday: '#273425', boardCard: '#2D362A' },
    text: { primary: '#E6E9E2', secondary: '#A1A99B' },
    divider: '#333B30',
  },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    // The account icon in the top bar, and icons in menus (Profile, Log out), in hop green.
    MuiAppBar: { styleOverrides: { root: { '& [data-testid="account-menu"]': { color: HOP_GREEN_NIGHT } } } },
    MuiMenu: { styleOverrides: { paper: { '& .MuiListItemIcon-root': { color: HOP_GREEN_NIGHT } } } },
    // A lifted nav panel with green icons.
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#2B3428',
          borderRight: '1px solid #4A5745',
          boxShadow: '2px 0 8px rgba(0,0,0,0.35)',
          '& .MuiListItemIcon-root': { color: HOP_GREEN_NIGHT },
        },
      },
    },
  },
}

export const lightTheme: Theme = createTheme(base, light)
export const darkTheme: Theme = createTheme(base, dark)
