import React from 'react';

const NowPlayingWidget = ({ spotifyUserId }) => {
    const widgetUrl = `https://spotify-github-profile.kittinanx.com/api/view.svg?uid=${spotifyUserId}&cover_image=true&theme=default&show_offline=true&background_color=121212&interchange=true&bar_color=53b14f&bar_color_cover=false`;

    return (
        <div className="now-playing-widget">
            <h5>Current Mood 🎧</h5>
            <a href="https://open.spotify.com/user/YOUR_SPOTIFY_USERNAME?si=YOUR_SI_VALUE" target="_blank" rel="noopener noreferrer">
                <i>
                    <img src={widgetUrl} alt="Spotify Now Playing" />
                </i>
            </a>
        </div>
    );
};

export default NowPlayingWidget;