'use client'

export function Logo() {
  const handleClick = () => {
    window.location.href = '/'
  }

  return (
    <div
      className="text-lg font-bold flex flex-row items-center font-geist cursor-pointer"
      onClick={handleClick}
    >
<img src="/logo.svg" alt="RUMOUR" className="w-50 h-50" />
    </div>
  )
}
