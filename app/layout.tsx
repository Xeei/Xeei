import './globals.css'
import { ReactNode } from 'react'

export const metadata = {
  title: 'Phurinat Khrueatan Portfolio',
  description: 'Portfolio site for Phurinat Khrueatan, SKE22 at Kasetsart University'
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
