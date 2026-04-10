export type GuestProfile = {
  displayName: string
  storageKey: string
}

const GUEST_STORAGE_KEY = 'chessight.guest.profile.v1'

export function createGuestProfile(): GuestProfile {
  return {
    displayName: 'Guest',
    storageKey: 'chessight.profile.guest.default',
  }
}

export function loadGuestProfile(): GuestProfile | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(GUEST_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<GuestProfile>
    if (!parsed.storageKey) return null
    return {
      displayName: parsed.displayName ?? 'Guest',
      storageKey: parsed.storageKey,
    }
  } catch {
    return null
  }
}

export function saveGuestProfile(profile: GuestProfile): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(profile))
}
