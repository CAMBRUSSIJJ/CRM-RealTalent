export type NotificationFrequency = 'realtime' | 'hourly' | 'daily'

export interface NotificationPreferences {
  inAppEnabled: boolean
  browserEnabled: boolean
  frequency: NotificationFrequency
  quietHoursEnabled: boolean
  quietStart: string
  quietEnd: string
  upcomingWindowHours: number
  proposalSilenceDays: number
  overdueActivities: boolean
  upcomingActivities: boolean
  upcomingEvents: boolean
  proposalFollowups: boolean
  staleLeads: boolean
  goalsAtRisk: boolean
  automationFailures: boolean
}
