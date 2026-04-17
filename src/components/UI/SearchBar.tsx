import React, { useState } from 'react'

const SearchBar: React.FC = () => {
  const [text, setText] = useState('')

  return (
    <div className="bg-gray-800 text-gray-100 rounded-lg p-3 w-full">
      <input
        type="text"
        placeholder="Filter venues…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full bg-gray-700 rounded px-2 py-1 text-sm"
      />
    </div>
  )
}

export default SearchBar
