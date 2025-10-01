'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { toast } from 'sonner'

export function SignInForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    
    try {
      if (isRegistering) {
        // Register user
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password })
        })

        const data = await response.json()

        if (!response.ok) {
          toast.error(data.error || 'Registration failed')
          return
        }

        toast.success('Account created! Please sign in.')
        setIsRegistering(false)
        setName('')
        setPassword('')
      } else {
        // Sign in user
        const result = await signIn('credentials', {
          email,
          password,
          redirect: false,
        })

        if (result?.error) {
          toast.error('Invalid email or password')
        } else if (result?.ok) {
          toast.success('Signed in successfully!')
          window.location.href = '/dashboard'
        }
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
      console.error('Auth error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        {isRegistering && (
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              type="text"
              placeholder="Enter your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required={isRegistering}
            />
          </div>
        )}
        
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder={isRegistering ? "Create a password (min 6 chars)" : "Enter your password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={isRegistering ? 6 : undefined}
          />
        </div>
        
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading 
            ? (isRegistering ? 'Creating Account...' : 'Signing In...') 
            : (isRegistering ? 'Create Account' : 'Sign In')
          }
        </Button>
      </form>

      <div className="text-center text-sm text-muted-foreground">
        {isRegistering ? (
          <>
            Already have an account?{' '}
            <Button 
              variant="link" 
              className="p-0 h-auto text-primary"
              onClick={() => setIsRegistering(false)}
              type="button"
            >
              Sign in
            </Button>
          </>
        ) : (
          <>
            Don't have an account?{' '}
            <Button 
              variant="link" 
              className="p-0 h-auto text-primary"
              onClick={() => setIsRegistering(true)}
              type="button"
            >
              Sign up
            </Button>
          </>
        )}
      </div>
    </div>
  )
}