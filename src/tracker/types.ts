/** A single accepted GPS point in a run. */
export interface TrackPoint {
  lat: number
  lon: number
  /** Epoch ms of the fix. */
  t: number
  /** Reported horizontal accuracy (m). */
  acc: number
  /** Altitude (m) if the device reported one. */
  ele?: number | null
  /** Segment index; a new segment starts after each pause. */
  seg: number
  /** Cumulative distance (m) at this point. */
  d: number
  /** Cumulative moving time (ms, excludes pauses) at this point. */
  mt: number
  /** True when this point was reached across a GPS gap (screen locked / app in background):
   *  the leg to it is an estimated straight line (drawn dashed). */
  est?: boolean
}

export interface Run {
  id: string
  startedAt: number
  endedAt: number
  movingMs: number
  distanceM: number
  points: TrackPoint[]
  name?: string
  /** Stores you tapped "Arrive at" during this trip. */
  stops?: Stop[]
  /** Part of distanceM that is estimated straight lines across GPS gaps (m). */
  estimatedM?: number
  /** 'trip' = recorded here; 'run' = imported from Run Tracker. */
  kind?: 'trip' | 'run'
  /** Where an imported entry came from. */
  source?: 'run-tracker' | 'backup'
}

/** A store arrival logged during a trip. */
export interface Stop {
  storeId: string
  name: string
  suburb: string
  /** Epoch ms when you tapped Arrive. */
  at: number
  /** Your position when you tapped Arrive. */
  lat: number
  lon: number
  /** Straight-line distance from you to the store's dock / store pin (m). */
  distToStoreM: number
  /** Trip distance so far (m). */
  tripDistM: number
}

export type Trip = Run

export interface Split {
  /** 1-based km number. */
  km: number
  /** Moving time taken for this km (ms). */
  splitMs: number
  /** Cumulative moving time at the end of this km (ms). */
  cumulativeMs: number
}

/** Raw fix as fed into the filter. */
export interface RawFix {
  lat: number
  lon: number
  t: number
  acc: number
  ele?: number | null
}
