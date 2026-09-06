import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/fraunces/400.css';
import '@fontsource/fraunces/600.css';
import '@fontsource/fraunces/700.css';
import '@fontsource/fraunces/400-italic.css';
import './styles/global.css';

import { Layout } from './components/Layout';
import Home from './pages/Home';
import Search from './pages/Search';
import Library from './pages/Library';
import TrackPage from './pages/TrackPage';
import ArtistPage from './pages/ArtistPage';
import AlbumPage from './pages/AlbumPage';
import Playlists from './pages/Playlists';
import PlaylistPage from './pages/PlaylistPage';
import Submit from './pages/Submit';
import Moderation from './pages/Moderation';
import Settings from './pages/Settings';
import { ArtistsPage, AlbumsPage, GenresPage, GenrePage, TagPage } from './pages/BrowsePages';
import { Favorites, History, Profile } from './pages/UserPages';
import Discover from './pages/Discover';
import Originals from './pages/Originals';
import Community from './pages/Community';
import Radio from './pages/Radio';
import Collections from './pages/Collections';
import CollectionPage from './pages/CollectionPage';

import { useAuth } from './stores/auth';
import { restorePlayerState, setupMediaSession } from './player/store';
import { engine } from './player/engine';

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/discover', element: <Discover /> },
      { path: '/originals', element: <Originals /> },
      { path: '/community', element: <Community /> },
      { path: '/radio', element: <Radio /> },
      { path: '/collections', element: <Collections /> },
      { path: '/collection/:slug', element: <CollectionPage /> },
      { path: '/search', element: <Search /> },
      { path: '/library', element: <Library /> },
      { path: '/track/:slug', element: <TrackPage /> },
      { path: '/artist/:slug', element: <ArtistPage /> },
      { path: '/artists', element: <ArtistsPage /> },
      { path: '/release/:slug', element: <AlbumPage /> },
      { path: '/albums', element: <AlbumsPage /> },
      { path: '/genres', element: <GenresPage /> },
      { path: '/genre/:id', element: <GenrePage /> },
      { path: '/tag/:id', element: <TagPage /> },
      { path: '/playlists', element: <Playlists /> },
      { path: '/playlist/:slug', element: <PlaylistPage /> },
      { path: '/submit', element: <Submit /> },
      { path: '/moderation', element: <Moderation /> },
      { path: '/favorites', element: <Favorites /> },
      { path: '/history', element: <History /> },
      { path: '/profile', element: <Profile /> },
      { path: '/settings', element: <Settings /> },
      { path: '*', element: (
        <div className="page">
          <div className="empty" style={{ marginTop: 60 }}>
            <h3>Page not found</h3>
            <p>The record you're looking for isn't in this crate.</p>
          </div>
        </div>
      ) },
    ],
  },
]);

/* boot */
void useAuth.getState().refresh();
void restorePlayerState();
setupMediaSession();

// Start the Web Audio analysis graph on the first user gesture so the
// visualizer has data whenever it's opened.
const primeAudio = () => {
  engine.ensureAnalysis();
  window.removeEventListener('pointerdown', primeAudio);
  window.removeEventListener('keydown', primeAudio);
};
window.addEventListener('pointerdown', primeAudio, { once: false });
window.addEventListener('keydown', primeAudio, { once: false });

/* PWA service worker */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
