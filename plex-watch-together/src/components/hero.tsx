'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PlayIcon, UsersIcon, ShieldIcon, SmartphoneIcon } from 'lucide-react'
import Link from 'next/link'
import { motion } from 'framer-motion'

export function Hero() {
  return (
    <section className="container mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
      <div className="text-center max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            Watch Movies Together,{' '}
            <span className="text-primary">Anywhere</span>
          </h1>
          
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Connect your Plex server and enjoy synchronized movie nights with friends. 
            Modern, secure, and mobile-friendly watch parties made simple.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Link href="/auth/signin">
              <Button size="lg" className="text-lg px-8 py-6">
                <PlayIcon className="mr-2 h-5 w-5" />
                Start Watching Together
              </Button>
            </Link>
            <Button variant="outline" size="lg" className="text-lg px-8 py-6">
              <UsersIcon className="mr-2 h-5 w-5" />
              Learn More
            </Button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative"
        >
          <Card className="p-8 bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 border-primary/20">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
              <div className="space-y-2">
                <ShieldIcon className="h-12 w-12 mx-auto text-primary" />
                <h3 className="font-semibold">Secure & Private</h3>
                <p className="text-sm text-muted-foreground">
                  Your Plex server stays private. End-to-end encrypted connections.
                </p>
              </div>
              
              <div className="space-y-2">
                <PlayIcon className="h-12 w-12 mx-auto text-primary" />
                <h3 className="font-semibold">Perfect Sync</h3>
                <p className="text-sm text-muted-foreground">
                  Real-time synchronization ensures everyone watches together.
                </p>
              </div>
              
              <div className="space-y-2">
                <SmartphoneIcon className="h-12 w-12 mx-auto text-primary" />
                <h3 className="font-semibold">Any Device</h3>
                <p className="text-sm text-muted-foreground">
                  Works perfectly on desktop, tablet, and mobile devices.
                </p>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </section>
  )
}