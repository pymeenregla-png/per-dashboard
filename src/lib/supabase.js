import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://kwyicmnbquqpuoxmsxgt.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3eWljbW5icXVxcHVveG1zeGd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NTk4MjIsImV4cCI6MjA5MzQzNTgyMn0.OvJn2jq_5W1H5A23JyiPdDQbLvFG_nkaLjZhCq4Mo6Q'

export const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: { params: { eventsPerSecond: 10 } },
})