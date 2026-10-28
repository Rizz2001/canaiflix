package com.canaimaflix.app;

// CanaimaFlix - Native ExoPlayer for KitKat API 19 (Updated Classpath)

import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.SurfaceView;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import com.google.android.exoplayer2.DefaultLoadControl;
import com.google.android.exoplayer2.ExoPlayer;
import com.google.android.exoplayer2.MediaItem;
import com.google.android.exoplayer2.PlaybackException;
import com.google.android.exoplayer2.Player;
import com.google.android.exoplayer2.source.DefaultMediaSourceFactory;
import com.google.android.exoplayer2.upstream.DefaultHttpDataSource;
import com.google.android.exoplayer2.video.VideoSize;

/**
 * Reproductor nativo (ExoPlayer) a pantalla completa que se superpone al WebView.
 * Reproduce HLS, MPEG-TS, MP4, etc. sin depender del motor de video del WebView de KitKat.
 */
public class NativePlayer {

    public interface Listener {
        /** state: loading | playing | buffering | ended | error | closed */
        void onEvent(String state, String message);
        void onOpenInVlc(String url, String title);
    }

    private static final String USER_AGENT = "VLC/3.0.20 LibVLC/3.0.20";
    private static final int HIDE_BARS_MS = 4000;

    private final Context context;
    private final FrameLayout parent;
    private final Listener listener;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final float density;

    private FrameLayout root;
    private FrameLayout videoHolder;
    private SurfaceView surfaceView;
    private LinearLayout topBar;
    private TextView titleView;
    private TextView statusView;
    private ProgressBar spinner;

    private ExoPlayer player;
    private String currentUrl;
    private String currentTitle;
    private boolean active = false;
    private float videoRatio = 0f;

    private final Runnable hideBars = new Runnable() {
        @Override public void run() {
            if (topBar != null && player != null && player.isPlaying()) {
                topBar.setVisibility(View.GONE);
            }
        }
    };

    public NativePlayer(Context context, FrameLayout parent, Listener listener) {
        this.context = context;
        this.parent = parent;
        this.listener = listener;
        this.density = context.getResources().getDisplayMetrics().density;
        buildViews();
    }

    private int dp(int v) {
        return (int) (v * density + 0.5f);
    }

    private TextView makeButton(String text, int bgColor) {
        TextView b = new TextView(context);
        b.setText(text);
        b.setTextColor(Color.WHITE);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(16), dp(10), dp(16), dp(10));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(bgColor);
        bg.setCornerRadius(dp(20));
        b.setBackground(bg);
        return b;
    }

    private void buildViews() {
        root = new FrameLayout(context);
        root.setBackgroundColor(Color.BLACK);
        root.setVisibility(View.GONE);
        root.setClickable(true);

        videoHolder = new FrameLayout(context);
        surfaceView = new SurfaceView(context);
        videoHolder.addView(surfaceView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.CENTER));
        root.addView(videoHolder, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        videoHolder.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { toggleBars(); }
        });
        videoHolder.addOnLayoutChangeListener(new View.OnLayoutChangeListener() {
            @Override public void onLayoutChange(View v, int l, int t, int r, int b, int ol, int ot, int or, int ob) {
                if (r - l != or - ol || b - t != ob - ot) applyAspect();
            }
        });

        spinner = new ProgressBar(context);
        FrameLayout.LayoutParams spLp = new FrameLayout.LayoutParams(dp(56), dp(56), Gravity.CENTER);
        root.addView(spinner, spLp);

        statusView = new TextView(context);
        statusView.setTextColor(Color.WHITE);
        statusView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        statusView.setGravity(Gravity.CENTER);
        statusView.setPadding(dp(32), dp(90), dp(32), 0);
        FrameLayout.LayoutParams stLp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER);
        root.addView(statusView, stLp);

        topBar = new LinearLayout(context);
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        topBar.setPadding(dp(16), dp(12), dp(16), dp(24));
        GradientDrawable fade = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
            new int[] { 0xCC000000, 0x00000000 });
        topBar.setBackground(fade);

        TextView back = makeButton("< Volver", 0x66FFFFFF);
        back.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { close(); }
        });
        topBar.addView(back);

        titleView = new TextView(context);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        titleView.setSingleLine(true);
        titleView.setEllipsize(android.text.TextUtils.TruncateAt.END);
        titleView.setPadding(dp(16), 0, dp(16), 0);
        topBar.addView(titleView, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView vlc = makeButton("Abrir en VLC", 0xFF3B82F6);
        vlc.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                if (listener != null && currentUrl != null) listener.onOpenInVlc(currentUrl, currentTitle);
            }
        });
        topBar.addView(vlc);

        root.addView(topBar, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP));

        parent.addView(root, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private void toggleBars() {
        handler.removeCallbacks(hideBars);
        if (topBar.getVisibility() == View.VISIBLE) {
            topBar.setVisibility(View.GONE);
        } else {
            topBar.setVisibility(View.VISIBLE);
            handler.postDelayed(hideBars, HIDE_BARS_MS);
        }
    }

    private void applyAspect() {
        if (videoRatio <= 0f) return;
        int w = videoHolder.getWidth();
        int h = videoHolder.getHeight();
        if (w <= 0 || h <= 0) return;
        int vw = w;
        int vh = (int) (w / videoRatio);
        if (vh > h) {
            vh = h;
            vw = (int) (h * videoRatio);
        }
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) surfaceView.getLayoutParams();
        if (lp.width != vw || lp.height != vh) {
            lp.width = vw;
            lp.height = vh;
            lp.gravity = Gravity.CENTER;
            surfaceView.setLayoutParams(lp);
        }
    }

    private void setStatus(String text, boolean showSpinner) {
        statusView.setText(text == null ? "" : text);
        statusView.setVisibility(text == null || text.length() == 0 ? View.GONE : View.VISIBLE);
        spinner.setVisibility(showSpinner ? View.VISIBLE : View.GONE);
    }

    private void emit(String state, String message) {
        if (listener != null) listener.onEvent(state, message == null ? "" : message);
    }

    public boolean isActive() {
        return active;
    }

    public void play(String url, String title) {
        release();
        currentUrl = url;
        currentTitle = title == null ? "" : title;
        active = true;
        videoRatio = 0f;

        titleView.setText(currentTitle);
        topBar.setVisibility(View.VISIBLE);
        root.setVisibility(View.VISIBLE);
        root.bringToFront();
        setStatus("Conectando...", true);
        emit("loading", "");

        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
            .setUserAgent(USER_AGENT)
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15000)
            .setReadTimeoutMs(20000);

        // Buffer ligero: tablet con ~1 GB de RAM
        DefaultLoadControl loadControl = new DefaultLoadControl.Builder()
            .setBufferDurationsMs(8000, 20000, 2000, 4000)
            .setTargetBufferBytes(12 * 1024 * 1024)
            .setPrioritizeTimeOverSizeThresholds(false)
            .build();

        player = new ExoPlayer.Builder(context)
            .setMediaSourceFactory(new DefaultMediaSourceFactory(http))
            .setLoadControl(loadControl)
            .build();

        player.addListener(new Player.Listener() {
            @Override public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_BUFFERING) {
                    setStatus("Cargando...", true);
                    emit("buffering", "");
                } else if (state == Player.STATE_READY) {
                    setStatus(null, false);
                    emit("playing", "");
                    handler.removeCallbacks(hideBars);
                    handler.postDelayed(hideBars, HIDE_BARS_MS);
                } else if (state == Player.STATE_ENDED) {
                    setStatus("Transmision finalizada", false);
                    emit("ended", "");
                }
            }

            @Override public void onVideoSizeChanged(VideoSize size) {
                if (size.width > 0 && size.height > 0) {
                    videoRatio = (size.width * size.pixelWidthHeightRatio) / size.height;
                    applyAspect();
                }
            }

            @Override public void onPlayerError(PlaybackException error) {
                if (error.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW && player != null) {
                    player.seekToDefaultPosition();
                    player.prepare();
                    return;
                }
                String msg = describeError(error);
                topBar.setVisibility(View.VISIBLE);
                setStatus(msg + "\nPuedes intentar con \"Abrir en VLC\".", false);
                emit("error", msg);
            }
        });

        player.setVideoSurfaceView(surfaceView);
        player.setMediaItem(MediaItem.fromUri(url));
        player.setPlayWhenReady(true);
        player.prepare();
    }

    private String describeError(PlaybackException e) {
        switch (e.errorCode) {
            case PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED:
            case PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT:
                return "No se pudo conectar con el servidor del canal.";
            case PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS:
                return "El servidor rechazo la solicitud (canal caido o sin permiso).";
            case PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED:
            case PlaybackException.ERROR_CODE_PARSING_MANIFEST_UNSUPPORTED:
            case PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED:
            case PlaybackException.ERROR_CODE_PARSING_MANIFEST_MALFORMED:
                return "Formato de transmision no compatible.";
            case PlaybackException.ERROR_CODE_DECODER_INIT_FAILED:
            case PlaybackException.ERROR_CODE_DECODING_FAILED:
            case PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED:
                return "La tablet no puede decodificar este video.";
            default:
                return "Error de reproduccion (" + e.getErrorCodeName() + ").";
        }
    }

    public void pause() {
        if (player != null) player.setPlayWhenReady(false);
    }

    public void resume() {
        if (player != null && active) player.setPlayWhenReady(true);
    }

    private void release() {
        handler.removeCallbacks(hideBars);
        if (player != null) {
            try {
                player.stop();
                player.release();
            } catch (Exception ignored) {}
            player = null;
        }
    }

    public void close() {
        if (!active && player == null) return;
        release();
        active = false;
        root.setVisibility(View.GONE);
        setStatus(null, false);
        emit("closed", "");
    }
}
