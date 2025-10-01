'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  MessageCircleIcon, 
  ZapIcon, 
  LockIcon, 
  MonitorIcon,
  UsersIcon,
  WifiIcon
} from 'lucide-react'
import { motion } from 'framer-motion'

const features = [
  {
    icon: MessageCircleIcon,
    title: 'Real-time Chat',
    description: 'Chat with friends while watching. React to scenes and share the experience together.'
  },
  {
    icon: ZapIcon,
    title: 'Instant Sync',
    description: 'Lightning-fast synchronization keeps everyone perfectly in sync, no matter the connection.'
  },
  {
    icon: LockIcon,
    title: 'Secure Rooms',
    description: 'Private watch rooms with invite codes. Your viewing sessions are completely secure.'
  },
  {
    icon: MonitorIcon,
    title: 'Plex Integration',
    description: 'Seamlessly connect to your existing Plex server and access your entire library.'
  },
  {
    icon: UsersIcon,
    title: 'Multiple Viewers',
    description: 'Support for up to 10 viewers per room with customizable host controls.'
  },
  {
    icon: WifiIcon,
    title: 'Cross-Platform',
    description: 'Works on any device with a web browser. No apps to install, just join and watch.'
  }
]

export function Features() {
  return (
    <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="text-center mb-12">
        <h2 className="text-3xl sm:text-4xl font-bold mb-4">
          Everything You Need for Perfect Watch Parties
        </h2>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Modern features designed for the best shared viewing experience possible.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feature, index) => {
          const Icon = feature.icon
          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
            >
              <Card className="h-full hover:shadow-lg transition-shadow border-muted/40">
                <CardHeader>
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>

      <div className="mt-16 text-center">
        <Card className="max-w-2xl mx-auto p-8 bg-gradient-to-r from-primary/5 via-transparent to-primary/5">
          <h3 className="text-2xl font-semibold mb-4">Ready to Get Started?</h3>
          <p className="text-muted-foreground mb-6">
            Create your first watch room in minutes and start enjoying movies with friends, 
            no matter where they are in the world.
          </p>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>✓ Free to use with your existing Plex server</p>
            <p>✓ No credit card required</p>
            <p>✓ Works with any Plex library</p>
          </div>
        </Card>
      </div>
    </section>
  )
}