<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAuth0 } from '@auth0/auth0-vue'
import CoordinateTrainer from './components/CoordinateTrainer.vue'
import PieceTrainer from './components/PieceTrainer.vue'
import { loadProfileSummary, type ProfileSummary } from './lib/profile'
import { createGuestProfile, loadGuestProfile, saveGuestProfile } from './lib/session'

type Drill = 'moves' | 'coordinates'
type Screen = Drill | 'profile'

const initialHash = typeof window !== 'undefined' ? window.location.hash : ''
const screen = ref<Screen>(initialHash === '#profile' ? 'profile' : initialHash === '#coordinates' ? 'coordinates' : 'moves')
const lastDrill = ref<Drill>(initialHash === '#coordinates' ? 'coordinates' : 'moves')
const guestProfile = ref(loadGuestProfile() ?? createGuestProfile())
const profileSummary = ref<ProfileSummary>(loadProfileSummary(guestProfile.value.storageKey))
const profileHelpOpen = ref(false)

const { isAuthenticated, user, error, loginWithRedirect, logout } = useAuth0()

const profileStorageKey = computed(() => {
  if (isAuthenticated.value) {
    const id = user.value?.sub || user.value?.email || 'anonymous'
    return `chessight.auth0.${id.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  }

  return guestProfile.value.storageKey
})

const displayName = computed(() => {
  if (isAuthenticated.value) {
    const email = user.value?.email
    return email || user.value?.name || 'Signed in'
  }

  return guestProfile.value.displayName
})

const isGuest = computed(() => !isAuthenticated.value)

const profileAvatar = computed(() => {
  if (isAuthenticated.value) return user.value?.picture ?? ''
  return ''
})

const profileEmail = computed(() => {
  if (isAuthenticated.value) return user.value?.email ?? ''
  return ''
})

function signup() {
  return loginWithRedirect({ authorizationParams: { screen_hint: 'signup' } })
}

function login() {
  return loginWithRedirect()
}

function saveProgress() {
  return login()
}

function signout() {
  return logout({ logoutParams: { returnTo: window.location.origin } })
}

function setScreen(next: Drill) {
  lastDrill.value = next
  screen.value = next
  window.location.hash = next === 'coordinates' ? 'coordinates' : 'moves'
}

function openProfile() {
  profileSummary.value = loadProfileSummary(profileStorageKey.value)
  screen.value = 'profile'
  profileHelpOpen.value = false
  window.location.hash = 'profile'
}

function closeProfile() {
  profileHelpOpen.value = false
  const next = lastDrill.value
  screen.value = next
  window.location.hash = next === 'coordinates' ? 'coordinates' : 'moves'
}

function toggleProfileHelp() {
  profileHelpOpen.value = !profileHelpOpen.value
}

onMounted(() => {
  saveGuestProfile(guestProfile.value)
  window.addEventListener('keydown', handleKeydown)
})

watch(profileStorageKey, () => {
  if (screen.value === 'profile') {
    profileSummary.value = loadProfileSummary(profileStorageKey.value)
  }
})

function refreshProfile() {
  profileSummary.value = loadProfileSummary(profileStorageKey.value)
}

watch(isAuthenticated, () => {
  if (screen.value === 'profile') refreshProfile()
})

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && profileHelpOpen.value) {
    profileHelpOpen.value = false
    event.preventDefault()
    return
  }
  if (event.key === 'Escape' && screen.value === 'profile') closeProfile()
}

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <div class="brand-lockup">
        <div class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 40 40" role="presentation" focusable="false">
            <use href="/chess-pieces-standard.svg#wn" />
          </svg>
        </div>
        <div class="brand-copy">
          <div class="eyebrow">ChessSight</div>
          <div class="brand">Visualization drills</div>
        </div>
      </div>

      <div v-if="screen !== 'profile'" class="mode-switch mode-switch-inline" role="tablist" aria-label="Drill type">
        <button
          type="button"
          class="mode-chip"
          :class="{ active: screen === 'moves' }"
          @click="setScreen('moves')"
        >
          Piece moves
        </button>
        <button
          type="button"
          class="mode-chip"
          :class="{ active: screen === 'coordinates' }"
          @click="setScreen('coordinates')"
        >
          Coordinates
        </button>
      </div>

      <div class="account-wrap">
        <div class="account-pill">
          <div class="account-avatar" :class="{ guest: isGuest }">
            <img v-if="profileAvatar" :src="profileAvatar" :alt="displayName" />
            <span v-else>{{ displayName.slice(0, 1).toUpperCase() }}</span>
          </div>
          <button type="button" class="account-name" @click="openProfile">
            {{ displayName }}
          </button>
          <button
            v-if="isGuest"
            type="button"
            class="account-link"
            @click="saveProgress"
          >
            Save
          </button>
          <button
            v-else
            type="button"
            class="account-link"
            @click="signout"
          >
            Log out
          </button>
        </div>
      </div>
    </header>

    <section v-if="screen !== 'profile'" class="trainer-stage">
      <PieceTrainer
        v-if="screen === 'moves'"
        :storage-key="`${profileStorageKey}.piece`"
      />
      <CoordinateTrainer
        v-else
        :storage-key="`${profileStorageKey}.coordinates`"
      />
    </section>

    <section v-else class="profile-stage">
      <div class="profile-sheet">
        <div class="profile-top">
          <div class="profile-identity">
            <div class="profile-avatar-lg" :class="{ guest: isGuest }">
              <img v-if="profileAvatar" :src="profileAvatar" :alt="displayName" />
              <span v-else>{{ displayName.slice(0, 1).toUpperCase() }}</span>
            </div>
            <div class="profile-copy">
              <div class="label">Profile</div>
              <div class="profile-title">{{ displayName }}</div>
              <div class="micro-copy">{{ profileEmail || 'Guest session' }}</div>
            </div>
          </div>

          <div class="profile-actions">
            <button type="button" class="ghost-button" @click="closeProfile">Back to drills</button>
            <button
              v-if="isGuest"
              type="button"
              class="primary-button"
              @click="saveProgress"
            >
              Save progress
            </button>
            <button
              v-else
              type="button"
              class="primary-button"
              @click="signout"
            >
              Log out
            </button>
          </div>
        </div>

        <div class="profile-meta">
          <span>{{ isGuest ? 'Guest profile' : 'Auth0 account' }}</span>
          <span>Level {{ profileSummary.level }}</span>
          <span>{{ profileSummary.league }} league</span>
          <span>{{ profileSummary.xp }} XP</span>
          <button
            type="button"
            class="info-button profile-meta-info"
            aria-label="How scoring works"
            @click="toggleProfileHelp"
          >
            i
          </button>
        </div>

        <div class="profile-kpis">
          <div class="profile-kpi">
            <span>Accuracy</span>
            <strong>{{ profileSummary.overallAccuracy }}%</strong>
          </div>
          <div class="profile-kpi">
            <span>Best streak</span>
            <strong>{{ profileSummary.bestStreak }}</strong>
          </div>
          <div class="profile-kpi">
            <span>Level</span>
            <strong>{{ profileSummary.level }}</strong>
          </div>
          <div class="profile-kpi">
            <span>League</span>
            <strong>{{ profileSummary.league }}</strong>
          </div>
        </div>

        <div class="profile-grid">
          <div class="profile-panel">
            <div class="panel-label">Progress</div>
            <div class="profile-list">
              <div class="profile-row">
                <span>XP</span>
                <strong>{{ profileSummary.xp }}</strong>
              </div>
              <div class="profile-row">
                <span>Questions answered</span>
                <strong>{{ profileSummary.totalAttempts }}</strong>
              </div>
              <div class="profile-row">
                <span>Sessions finished</span>
                <strong>{{ profileSummary.drillsCompleted }}</strong>
              </div>
              <div class="profile-row">
                <span>Average response</span>
                <strong>{{ profileSummary.averageResponseMs }} ms</strong>
              </div>
            </div>
          </div>

          <div class="profile-panel">
            <div class="panel-label">Mastery</div>
            <div class="profile-list">
              <div class="profile-row">
                <span>Strongest piece</span>
                <strong>{{ profileSummary.strongestPiece }}</strong>
              </div>
              <div class="profile-row">
                <span>Weakest piece</span>
                <strong>{{ profileSummary.weakestPiece }}</strong>
              </div>
              <div class="profile-row">
                <span>Strongest square</span>
                <strong>{{ profileSummary.strongestSquare }}</strong>
              </div>
              <div class="profile-row">
                <span>Weakest square</span>
                <strong>{{ profileSummary.weakestSquare }}</strong>
              </div>
            </div>
          </div>

          <div class="profile-panel">
            <div class="panel-label">Streaks</div>
            <div class="profile-list">
              <div class="profile-row">
                <span>Piece streak</span>
                <strong>{{ profileSummary.pieceBestStreak }}</strong>
              </div>
              <div class="profile-row">
                <span>Coordinate streak</span>
                <strong>{{ profileSummary.coordinateBestStreak }}</strong>
              </div>
              <div class="profile-row">
                <span>Dark-square accuracy</span>
                <strong>{{ profileSummary.darkAccuracy ?? '—' }}%</strong>
              </div>
              <div class="profile-row">
                <span>Light-square accuracy</span>
                <strong>{{ profileSummary.lightAccuracy ?? '—' }}%</strong>
              </div>
            </div>
          </div>

        </div>

        <div v-if="profileHelpOpen" class="profile-modal-backdrop" @click.self="toggleProfileHelp">
          <div class="profile-modal" role="dialog" aria-label="Metric definitions">
            <div class="profile-help-header">
              <strong>Scoring breakdown</strong>
              <button type="button" class="ghost-button" @click="toggleProfileHelp">Close</button>
            </div>
            <div class="profile-help-grid">
              <div>
                <div class="panel-label">Streak</div>
                <div class="profile-note">
                  Consecutive correct answers inside one drill mode.
                  Piece and coordinate streaks are tracked separately.
                </div>
              </div>
              <div>
                <div class="panel-label">XP</div>
                <div class="profile-note">
                  100 per correct answer, 250 per finished session, 50 per best-streak point.
                </div>
              </div>
              <div>
                <div class="panel-label">League</div>
                <table class="league-table">
                  <thead>
                    <tr>
                      <th>League</th>
                      <th>Accuracy</th>
                      <th>Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Bronze</td>
                      <td>&lt; 60%</td>
                      <td>&lt; 20 answers</td>
                    </tr>
                    <tr>
                      <td>Silver</td>
                      <td>60-71%</td>
                      <td>20+ answers</td>
                    </tr>
                    <tr>
                      <td>Gold</td>
                      <td>72-83%</td>
                      <td>20+ answers</td>
                    </tr>
                    <tr>
                      <td>Platinum</td>
                      <td>84-91%</td>
                      <td>20+ answers</td>
                    </tr>
                    <tr>
                      <td>Diamond</td>
                      <td>92%+</td>
                      <td>20+ answers</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div>
                <div class="panel-label">Mastery</div>
                <div class="profile-note">
                  Pieces are mastered at 5 attempts and 75% accuracy. Squares use 4 attempts and 75% accuracy.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <p v-if="!isGuest && error" class="auth-error auth-inline-error">{{ error.message }}</p>
  </main>
</template>
