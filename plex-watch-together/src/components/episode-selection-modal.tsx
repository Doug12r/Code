'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Play, Clock, Star, Calendar, ChevronLeft, Tv, Film } from 'lucide-react';
import Image from 'next/image';

interface Episode {
  ratingKey: string;
  key: string;
  title: string;
  summary?: string;
  index: number;
  parentIndex: number;
  thumb?: string;
  art?: string;
  duration?: number;
  rating?: number;
  year?: number;
  originallyAvailableAt?: string;
  addedAt: number;
  viewCount?: number;
  grandparentTitle?: string;
  parentTitle?: string;
}

interface Season {
  ratingKey: string;
  title: string;
  summary?: string;
  index: number;
  thumb?: string;
  art?: string;
  leafCount: number;
  viewedLeafCount: number;
  addedAt: number;
  updatedAt: number;
}

interface TVShow {
  ratingKey: string;
  title: string;
  summary?: string;
  year?: number;
  thumb?: string;
  art?: string;
  type: string;
}

interface EpisodeSelectionModalProps {
  show: TVShow | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectEpisode: (episode: Episode) => void;
  plexToken?: string;
  plexUrl?: string;
}

export default function EpisodeSelectionModal({ 
  show, 
  isOpen, 
  onClose, 
  onSelectEpisode,
  plexToken,
  plexUrl 
}: EpisodeSelectionModalProps) {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'seasons' | 'episodes'>('seasons');

  // Load seasons when show changes
  useEffect(() => {
    if (show && isOpen) {
      loadSeasons();
    } else {
      // Reset state when modal closes
      setSeasons([]);
      setEpisodes([]);
      setSelectedSeason(null);
      setView('seasons');
      setError('');
    }
  }, [show, isOpen]);

  const loadSeasons = async () => {
    if (!show) return;
    
    try {
      setLoading(true);
      setError('');
      
      const response = await fetch(`/api/plex/shows/${show.ratingKey}?type=seasons`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Failed to load seasons (${response.status})`);
      }

      const data = await response.json();
      setSeasons(data.seasons || []);
      
    } catch (err) {
      console.error('Error loading seasons:', err);
      setError(err instanceof Error ? err.message : 'Failed to load seasons.');
    } finally {
      setLoading(false);
    }
  };

  const loadEpisodes = async (season: Season) => {
    try {
      setLoading(true);
      setError('');
      
      const response = await fetch(`/api/plex/shows/${show!.ratingKey}?type=episodes&season=${season.ratingKey}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Failed to load episodes (${response.status})`);
      }

      const data = await response.json();
      setEpisodes(data.episodes || []);
      setSelectedSeason(season);
      setView('episodes');
      
    } catch (err) {
      console.error('Error loading episodes:', err);
      setError(err instanceof Error ? err.message : 'Failed to load episodes.');
    } finally {
      setLoading(false);
    }
  };

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

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return '';
    }
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

  const handleEpisodeSelect = (episode: Episode) => {
    onSelectEpisode(episode);
    onClose();
  };

  const handleBackToSeasons = () => {
    setView('seasons');
    setSelectedSeason(null);
    setEpisodes([]);
  };

  if (!show) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Tv className="h-5 w-5" />
            {show.title}
            {view === 'episodes' && selectedSeason && (
              <>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">{selectedSeason.title}</span>
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {view === 'seasons' 
              ? 'Select a season to browse episodes'
              : `Choose an episode from ${selectedSeason?.title}`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          <div className="p-6 pt-0">
            {error && (
              <div className="text-destructive text-sm p-3 bg-destructive/10 rounded-md mb-4">
                <div className="flex items-center justify-between">
                  <span>{error}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setError('');
                      if (view === 'seasons') {
                        loadSeasons();
                      } else if (selectedSeason) {
                        loadEpisodes(selectedSeason);
                      }
                    }}
                    className="ml-2"
                  >
                    Retry
                  </Button>
                </div>
              </div>
            )}

            {loading && (
              <div className="text-muted-foreground text-sm p-3 bg-muted/50 rounded-md flex items-center gap-2 mb-4">
                <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
                Loading {view === 'seasons' ? 'seasons' : 'episodes'}...
              </div>
            )}

            {/* Episodes View */}
            {view === 'episodes' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleBackToSeasons}
                    className="gap-2"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back to Seasons
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {episodes.map((episode) => (
                    <Card 
                      key={episode.ratingKey} 
                      className="group cursor-pointer hover:shadow-lg transition-shadow"
                      onClick={() => handleEpisodeSelect(episode)}
                    >
                      <div className="flex">
                        <div className="relative w-48 h-32 flex-shrink-0">
                          <Image
                            src={getImageUrl(episode.thumb, episode.ratingKey)}
                            alt={episode.title}
                            fill
                            className="object-cover rounded-l-lg"
                            onError={() => handleImageError(episode.ratingKey)}
                            unoptimized={true}
                            sizes="192px"
                          />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Button size="sm" className="gap-2">
                              <Play className="h-4 w-4" />
                              Select Episode
                            </Button>
                          </div>
                          {episode.rating && (
                            <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                              {episode.rating.toFixed(1)}
                            </div>
                          )}
                        </div>
                        <CardContent className="flex-1 p-4">
                          <div className="space-y-2">
                            <div className="flex items-start justify-between">
                              <div>
                                <h3 className="font-semibold text-lg leading-tight">
                                  {episode.index}. {episode.title}
                                </h3>
                                <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                                  <span>Season {episode.parentIndex}</span>
                                  {episode.duration && (
                                    <>
                                      <span>•</span>
                                      <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {formatDuration(episode.duration)}
                                      </span>
                                    </>
                                  )}
                                  {episode.originallyAvailableAt && (
                                    <>
                                      <span>•</span>
                                      <span className="flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        {formatDate(episode.originallyAvailableAt)}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                              {episode.viewCount && episode.viewCount > 0 && (
                                <Badge variant="secondary" className="ml-2">
                                  Watched
                                </Badge>
                              )}
                            </div>
                            {episode.summary && (
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {episode.summary}
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Seasons View */}
            {view === 'seasons' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {seasons.map((season) => (
                  <Card 
                    key={season.ratingKey} 
                    className="group cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => loadEpisodes(season)}
                  >
                    <div className="relative aspect-[2/3] overflow-hidden rounded-t-lg">
                      <Image
                        src={getImageUrl(season.thumb, season.ratingKey)}
                        alt={season.title}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform"
                        onError={() => handleImageError(season.ratingKey)}
                        unoptimized={true}
                        sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Button size="sm" className="gap-2">
                          <Film className="h-4 w-4" />
                          Browse Episodes
                        </Button>
                      </div>
                    </div>
                    <CardContent className="p-4">
                      <div className="space-y-2">
                        <h3 className="font-semibold text-lg leading-tight">
                          {season.title}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{season.leafCount} episodes</span>
                          {season.viewedLeafCount > 0 && (
                            <>
                              <span>•</span>
                              <span>{season.viewedLeafCount} watched</span>
                            </>
                          )}
                        </div>
                        {season.summary && (
                          <p className="text-sm text-muted-foreground line-clamp-3">
                            {season.summary}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {!loading && !error && view === 'seasons' && seasons.length === 0 && (
              <div className="text-center p-8">
                <Tv className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No seasons found</h3>
                <p className="text-muted-foreground">
                  This show doesn't seem to have any seasons available.
                </p>
              </div>
            )}

            {!loading && !error && view === 'episodes' && episodes.length === 0 && (
              <div className="text-center p-8">
                <Film className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No episodes found</h3>
                <p className="text-muted-foreground">
                  No episodes are available for this season.
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}