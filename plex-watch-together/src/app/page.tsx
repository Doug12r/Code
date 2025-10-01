import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Hero } from '@/components/hero'
import { Features } from '@/components/features'
import { Navigation } from '@/components/navigation'

export default async function Home() {
  const session = await getServerSession(authOptions)
  
  if (session) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <Navigation />
      <main>
        <Hero />
        <Features />
      </main>
    </div>
  )
}
