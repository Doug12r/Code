'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Play, Search, Film, Tv, Clock, Star } from 'lucide-react';
import Image from 'next/image';

interface PlexMedia {
  ratingKey: string;
  key: string;
  title: string;
  summary?: string;
  year?: number;
  duration?: number;
  rating?: number;
  thumb?: string;
  art?: string;
  type: 'movie' | 'show' | 'episode';
  genre?: string[];
  studio?: string;
  addedAt?: number;
}

interface PlexLibrary {
  key: string;
  title: string;
  type: string;
  agent: string;
  scanner: string;
  language: string;
  uuid: string;
  updatedAt: number;
  createdAt: number;
}

interface MediaLibraryProps {
  onSelectMedia: (media: PlexMedia) => void;
  plexToken?: string;
  plexUrl?: string;
}

export default function MediaLibrary({ onSelectMedia, plexToken, plexUrl }: MediaLibraryProps) {
  const [libraries, setLibraries] = useState<PlexLibrary[]>([]);
  const [selectedLibrary, setSelectedLibrary] = useState<string>('');
  const [media, setMedia] = useState<PlexMedia[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load Plex libraries on component mount
  useEffect(() => {
    if (plexToken && plexUrl) {
      console.log('MediaLibrary: Starting to load libraries with token/URL provided');
      loadLibraries();
    } else {
      console.log('MediaLibrary: No plex token or URL provided', { hasToken: !!plexToken, hasUrl: !!plexUrl });
    }
  }, [plexToken, plexUrl]);

  // Load media when library is selected
  useEffect(() => {
    if (selectedLibrary && plexToken && plexUrl) {
      loadLibraryMedia(selectedLibrary);
    }
  }, [selectedLibrary, plexToken, plexUrl]);

  // Cleanup search timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const loadLibrariesWithRetry = async (retries = 2): Promise<void> => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        console.log(`Loading Plex libraries... (attempt ${attempt + 1}/${retries + 1})`);
        const response = await fetch('/api/plex/libraries', {
          headers: {
            'Content-Type': 'application/json',
          }
        });

        console.log('Libraries API response status:', response.status);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.error('Libraries API error:', errorData);
          
          // If it's a server error and we have retries left, try again
          if (response.status >= 500 && attempt < retries) {
            console.log(`Server error, retrying in ${(attempt + 1) * 1000}ms...`);
            await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
            continue;
          }
          
          throw new Error(errorData.error || `Failed to load libraries (${response.status})`);
        }

        const data = await response.json();
        console.log('Libraries data received:', data);
        
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid response format from libraries API');
        }
        
        setLibraries(data.libraries || []);
        
        // Auto-select first movie/show library
        const movieLibrary = data.libraries?.find((lib: PlexLibrary) => 
          lib.type === 'movie' || lib.type === 'show'
        );
        if (movieLibrary) {
          setSelectedLibrary(movieLibrary.key);
        }
        
        return; // Success, exit retry loop
      } catch (err) {
        console.error(`Error loading libraries (attempt ${attempt + 1}):`, err);
        
        // If this is the last attempt, set the error
        if (attempt === retries) {
          let errorMessage = 'Failed to load Plex libraries.';
          if (err instanceof Error) {
            if (err.message.includes('timeout')) {
              errorMessage = 'Connection timeout. Your Plex server may be slow or unreachable.';
            } else {
              errorMessage = err.message;
            }
          }
          setError(errorMessage);
        } else {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
        }
      }
    }
  };

  const loadLibraries = async () => {
    try {
      setLoading(true);
      setError('');
      await loadLibrariesWithRetry();
    } finally {
      setLoading(false);
    }
  };

  const loadLibraryMediaWithRetry = async (libraryKey: string, retries = 2): Promise<void> => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        console.log(`Loading media for library ${libraryKey}... (attempt ${attempt + 1}/${retries + 1})`);
        const response = await fetch(`/api/plex/libraries/${libraryKey}/media`, {
          headers: {
            'Content-Type': 'application/json',
          }
        });

        console.log('Media API response status:', response.status);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.error('Media API error:', errorData);
          
          // If it's a server error and we have retries left, try again
          if (response.status >= 500 && attempt < retries) {
            console.log(`Server error, retrying in ${(attempt + 1) * 1000}ms...`);
            await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
            continue;
          }
          
          throw new Error(errorData.error || `Failed to load media (${response.status})`);
        }

        const data = await response.json();
        console.log('Media data received:', data);
        console.log('Media items loaded:', data.media?.length || 0, 'items');
        
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid response format from media API');
        }
        
        setMedia(data.media || []);
        return; // Success, exit retry loop
      } catch (err) {
        console.error(`Error loading media (attempt ${attempt + 1}):`, err);
        
        // If this is the last attempt, set the error
        if (attempt === retries) {
          let errorMessage = 'Failed to load media from library.';
          if (err instanceof Error) {
            if (err.message.includes('timeout')) {
              errorMessage = 'Connection timeout. Your Plex server may be slow or unreachable.';
            } else {
              errorMessage = err.message;
            }
          }
          setError(errorMessage);
        } else {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
        }
      }
    }
  };

  const loadLibraryMedia = async (libraryKey: string) => {
    try {
      setLoading(true);
      setError('');
      await loadLibraryMediaWithRetry(libraryKey);
    } finally {
      setLoading(false);
    }
  };

  const searchMedia = useCallback(async (query: string) => {
    if (!query.trim()) {
      if (selectedLibrary) {
        loadLibraryMedia(selectedLibrary);
      }
      return;
    }

    try {
      setIsSearching(true);
      setError('');
      
      const response = await fetch(`/api/plex/search?q=${encodeURIComponent(query)}`, {
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Search failed with status ${response.status}`);
      }

      const data = await response.json();
      setMedia(data.results || []);
    } catch (err) {
      console.error('Error searching media:', err);
      setError(err instanceof Error ? err.message : 'Failed to search media.');
    } finally {
      setIsSearching(false);
    }
  }, [selectedLibrary]);

  const debouncedSearch = useCallback((query: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      if (query.trim()) {
        searchMedia(query);
      }
    }, 500);
  }, [searchMedia]);

  const formatDuration = (duration?: number) => {
    if (!duration) return '';
    const minutes = Math.floor(duration / 60000);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${minutes}m`;
  };

  const getImageUrl = (thumb?: string, ratingKey?: string) => {
    if (!thumb || !plexUrl || (ratingKey && imageErrors.has(ratingKey))) {
      return '/placeholder-media.jpg';
    }
    return `${plexUrl}${thumb}?X-Plex-Token=${plexToken}`;
  };

  const handleImageError = (ratingKey: string) => {
    setImageErrors((prev: Set<string>) => new Set([...prev, ratingKey]));
  };

  const filteredMedia = media.filter(item =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.summary?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!plexToken || !plexUrl) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Film className="h-5 w-5" />
            Media Library
          </CardTitle>
          <CardDescription>
            Please configure your Plex server to browse media.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Film className="h-5 w-5" />
            Media Library
          </CardTitle>
          <CardDescription>
            Browse and select content from your Plex server to watch together.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Library Selection */}
          {libraries.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {libraries.map((library) => (
                <Button
                  key={library.key}
                  variant={selectedLibrary === library.key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedLibrary(library.key)}
                  className="flex items-center gap-2"
                >
                  {library.type === 'movie' ? <Film className="h-4 w-4" /> : <Tv className="h-4 w-4" />}
                  {library.title}
                </Button>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search movies and TV shows..."
              value={searchQuery}
              onChange={(e) => {
                const newQuery = e.target.value;
                setSearchQuery(newQuery);
                if (newQuery.trim()) {
                  debouncedSearch(newQuery);
                } else if (selectedLibrary) {
                  loadLibraryMedia(selectedLibrary);
                }
              }}
              className="pl-10"
            />
          </div>

          {error && (
            <div className="text-destructive text-sm p-3 bg-destructive/10 rounded-md">
              <div className="flex items-center justify-between">
                <span>{error}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setError('');
                    if (selectedLibrary) {
                      loadLibraryMedia(selectedLibrary);
                    } else {
                      loadLibraries();
                    }
                  }}
                  className="ml-2"
                >
                  Retry
                </Button>
              </div>
            </div>
          )}

          {(loading || isSearching) && (
            <div className="text-muted-foreground text-sm p-3 bg-muted/50 rounded-md flex items-center gap-2">
              <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
              {isSearching ? 'Searching...' : loading ? 'Loading...' : ''}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Media Grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <div className="aspect-[2/3] bg-muted rounded-t-lg" />
              <CardContent className="p-3">
                <div className="h-4 bg-muted rounded mb-2" />
                <div className="h-3 bg-muted rounded w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredMedia.map((item) => (
            <Card key={item.ratingKey} className="group cursor-pointer hover:shadow-lg transition-shadow">
              <div 
                className="relative aspect-[2/3] overflow-hidden rounded-t-lg"
                onClick={() => onSelectMedia(item)}
              >
                <Image
                  src={getImageUrl(item.thumb, item.ratingKey)}
                  alt={item.title}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform"
                  onError={() => handleImageError(item.ratingKey)}
                  unoptimized={true}
                  sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button size="sm" className="gap-2">
                    <Play className="h-4 w-4" />
                    Select
                  </Button>
                </div>
                {item.rating && (
                  <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    {item.rating.toFixed(1)}
                  </div>
                )}
              </div>
              <CardContent className="p-3">
                <div className="space-y-1">
                  <h3 className="font-semibold text-sm line-clamp-2 leading-tight">
                    {item.title}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {item.year && <span>{item.year}</span>}
                    {item.duration && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(item.duration)}
                        </span>
                      </>
                    )}
                  </div>
                  {item.genre && item.genre.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.genre.slice(0, 2).map((g) => (
                        <Badge key={g} variant="secondary" className="text-xs px-1 py-0">
                          {g}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && filteredMedia.length === 0 && (selectedLibrary || searchQuery) && (
        <Card>
          <CardContent className="p-8 text-center">
            <Film className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No media found</h3>
            <p className="text-muted-foreground">
              {searchQuery 
                ? `No results found for "${searchQuery}"`
                : 'This library appears to be empty'
              }
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}