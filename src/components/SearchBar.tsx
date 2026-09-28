interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

export function SearchBar({
  value,
  onChange,
  placeholder = 'Search store or suburb…',
}: Props) {
  return (
    <div className="search">
      <label className="sr-only" htmlFor="zone-search">
        Search stores
      </label>
      <input
        id="zone-search"
        className="search__input"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="search"
      />
    </div>
  )
}
