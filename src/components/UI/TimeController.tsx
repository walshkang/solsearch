import React from 'react'
import useAppStore from '../../store/useAppStore'

function minutesToTimeString(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  const ampm = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  const mm = m.toString().padStart(2, '0')
  return `${h12}:${mm} ${ampm}`
}

const TimeController: React.FC = () => {
  const timeOfDayMinutes = useAppStore((s) => s.timeOfDayMinutes)
  const currentDate = useAppStore((s) => s.currentDate)
  const setTimeOfDayMinutes = useAppStore((s) => s.setTimeOfDayMinutes)
  const setCurrentDate = useAppStore((s) => s.setCurrentDate)

  const onSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTimeOfDayMinutes(Number(e.target.value))
  }

  const onDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    if (!v) return
    // Create a date at local midnight for the selected day
    const [yearStr, monthStr, dayStr] = v.split('-')
    const year = Number(yearStr)
    const month = Number(monthStr) - 1
    const day = Number(dayStr)
    const d = new Date()
    d.setFullYear(year, month, day)
    d.setHours(0, 0, 0, 0)
    setCurrentDate(d)
  }

  const dateValue = currentDate ? currentDate.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)

  return (
    <div className="bg-gray-800 text-gray-100 rounded-lg p-3 w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">Time</span>
        <span className="text-sm">{minutesToTimeString(timeOfDayMinutes)}</span>
      </div>

      <input
        type="range"
        min={0}
        max={1439}
        step={1}
        value={timeOfDayMinutes}
        onChange={onSliderChange}
        className="w-full accent-yellow-400"
      />

      <div className="mt-2">
        <input
          type="date"
          value={dateValue}
          onChange={onDateChange}
          className="w-full bg-gray-700 text-gray-100 rounded p-1 text-sm"
        />
      </div>
    </div>
  )
}

export default TimeController

