# Plex Watch Together

A modern, secure, and mobile-friendly web application that enables synchronized movie watching with friends using your Plex server. Built with Next.js 14+, TypeScript, and real-time WebSocket communication.

## 🌟 Features

### 🎬 **Synchronized Viewing**
- Real-time play/pause/seek synchronization across all viewers
- Automatic drift correction to keep everyone perfectly in sync
- Buffer detection and automatic pausing for slower connections

### 🔐 **Secure & Private**
- Private watch rooms with unique invite codes
- End-to-end encrypted Plex authentication tokens
- Rate limiting and CSRF protection
- No data stored on external servers

### 📱 **Cross-Platform**
- Mobile-first responsive design
- Works on any device with a web browser
- Progressive Web App capabilities
- Touch-friendly controls for mobile devices

### 🎮 **Room Management**
- Create public or private watch rooms
- Invite friends with shareable room codes
- Host controls for play/pause/seek permissions
- Support for up to 10 viewers per room

### 💬 **Real-time Chat**
- Built-in chat during movie sessions
- System notifications for user join/leave events
- Emoji and reaction support

### 🔌 **Plex Integration**
- Seamless connection to your existing Plex server
- Browse your entire Plex library
- Support for movies, TV shows, and other media
- Automatic transcoding based on bandwidth

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database
- A Plex Media Server with content
- (Optional) Redis for enhanced performance

### Installation

1. **Clone and setup the project:**
   ```bash
   git clone <repository-url>
   cd plex-watch-together
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your settings:
   ```bash
   # Database
   DATABASE_URL="postgresql://username:password@localhost:5432/plex_watch_together"
   
   # NextAuth.js
   NEXTAUTH_URL="http://localhost:3000"
   NEXTAUTH_SECRET="your-secret-key-here"
   
   # OAuth Providers
   GOOGLE_CLIENT_ID="your-google-client-id"
   GOOGLE_CLIENT_SECRET="your-google-client-secret"
   ```

3. **Setup the database:**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

5. **Open http://localhost:3000** in your browser

## 🏗️ Tech Stack

### Frontend
- **Next.js 14+** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Shadcn/ui** - Modern component library
- **Framer Motion** - Smooth animations
- **React Query** - Server state management

### Backend
- **NextAuth.js** - Authentication with multiple providers
- **Prisma ORM** - Database management
- **Socket.io** - Real-time WebSocket communication
- **Rate Limiter** - API protection
- **bcryptjs** - Password hashing

### Database
- **PostgreSQL** - Primary database
- **Redis** (Optional) - Caching and rate limiting

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   │   ├── auth/         # NextAuth.js endpoints
│   │   └── socket/       # Socket.io handler
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Homepage
├── components/            # React components
│   ├── ui/               # Shadcn/ui components
│   ├── features.tsx      # Features section
│   ├── hero.tsx          # Hero section
│   └── navigation.tsx    # Navigation bar
├── lib/                  # Utilities and configurations
│   ├── auth.ts           # NextAuth.js config
│   ├── plex-api.ts       # Plex API client
│   ├── prisma.ts         # Prisma client
│   ├── socket.ts         # Socket.io server
│   └── utils.ts          # Utility functions
└── types/                # TypeScript type definitions
    └── auth.d.ts         # NextAuth.js types
```

## 🔧 Configuration

### Plex Server Setup

1. **Enable Remote Access** in your Plex server settings
2. **Generate an authentication token:**
   - Visit: `https://plex.tv/claim`
   - Get your claim token
   - Use it in the app to link your server

### OAuth Setup (Google)

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API
4. Create OAuth 2.0 credentials
5. Add your domain to authorized origins
6. Copy Client ID and Secret to your `.env` file

## 🚀 Deployment

### Using Vercel (Recommended)

1. **Deploy to Vercel:**
   ```bash
   npm install -g vercel
   vercel --prod
   ```

2. **Configure environment variables** in Vercel dashboard
3. **Setup database** - Use Vercel Postgres or any PostgreSQL provider

## 🔒 Security Features

- **JWT Authentication** with secure session management
- **Rate Limiting** on all API endpoints
- **CSRF Protection** for all forms
- **Input Validation** with Zod schemas
- **Encrypted Token Storage** for Plex authentication
- **Private Room Codes** with cryptographically secure generation

## 🧪 Development

### Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run type-check   # Run TypeScript checks
```

### Database Management

```bash
npx prisma studio    # Open Prisma Studio
npx prisma generate  # Generate Prisma client
npx prisma db push   # Push schema to database
npx prisma migrate   # Create migration
```

## 📝 License

This project is licensed under the MIT License.

---

**Note**: This application requires a Plex Media Server and is intended for personal use with content you own or have rights to stream. Please respect copyright laws in your jurisdiction.
