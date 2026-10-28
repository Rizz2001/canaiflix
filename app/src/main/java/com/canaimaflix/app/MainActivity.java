package com.canaimaflix.app;

// CanaimaFlix - MainActivity (API 19 KitKat - Updated Classpath)

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private FrameLayout rootLayout;
    private WebView webView;
    private FrameLayout customViewContainer;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private NativePlayer nativePlayer;

    private ValueCallback<Uri> mUploadMessage;
    private static final int FILECHOOSER_RESULTCODE = 1001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        installTlsSupport();

        // Modo pantalla completa inmersiva
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        setImmersiveMode();

        rootLayout = new FrameLayout(this);
        rootLayout.setBackgroundColor(0xFF0B0E14);

        webView = new WebView(this);
        rootLayout.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        customViewContainer = new FrameLayout(this);
        customViewContainer.setVisibility(View.GONE);
        customViewContainer.setBackgroundColor(0xFF000000);
        rootLayout.addView(customViewContainer, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        nativePlayer = new NativePlayer(this, rootLayout, new NativePlayer.Listener() {
            @Override
            public void onEvent(String state, String message) {
                notifyWebPlayerEvent(state, message);
            }

            @Override
            public void onOpenInVlc(String url, String title) {
                launchVlcExternal(url, title);
            }
        });

        setContentView(rootLayout);

        configureWebView();

        // Cargar directamente la app empaquetada dentro de la APK
        webView.loadUrl("file:///android_asset/index.html");
    }

    @SuppressWarnings("deprecation")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);

        // Directorio para base de datos interna en KitKat
        File dbDir = getDir("databases", Context.MODE_PRIVATE);
        settings.setDatabasePath(dbDir.getPath());

        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);

        // Permitir acceso a archivos y llamadas locales
        try {
            settings.getClass().getMethod("setAllowUniversalAccessFromFileURLs", boolean.class).invoke(settings, true);
            settings.getClass().getMethod("setAllowFileAccessFromFileURLs", boolean.class).invoke(settings, true);
        } catch (Exception ignored) {}

        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);

        // Color de fondo oscuro para evitar parpadeos blancos
        webView.setBackgroundColor(0xFF0B0E14);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("intent://") || url.startsWith("vlc://")) {
                    try {
                        Intent intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                        startActivity(intent);
                        return true;
                    } catch (Exception e) {
                        Toast.makeText(MainActivity.this, "No se pudo abrir VLC", Toast.LENGTH_SHORT).show();
                        return true;
                    }
                }
                return false;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            // Soporte para pantalla completa HTML5 nativa en WebView
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customViewCallback = callback;
                webView.setVisibility(View.GONE);
                customViewContainer.addView(view, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                customViewContainer.setVisibility(View.VISIBLE);
                setImmersiveMode();
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                customViewContainer.removeView(customView);
                customViewContainer.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);
                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                    customViewCallback = null;
                }
                customView = null;
                setImmersiveMode();
            }

            // Soporte para <input type="file"> en Android 4.4 KitKat (llamado por reflexión desde WebView)
            @SuppressWarnings("unused")
            public void openFileChooser(ValueCallback<Uri> uploadMsg, String acceptType, String capture) {
                mUploadMessage = uploadMsg;
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                startActivityForResult(Intent.createChooser(intent, "Seleccionar lista M3U"), FILECHOOSER_RESULTCODE);
            }

            @SuppressWarnings("unused")
            public void openFileChooser(ValueCallback<Uri> uploadMsg, String acceptType) {
                openFileChooser(uploadMsg, acceptType, "");
            }

            @SuppressWarnings("unused")
            public void openFileChooser(ValueCallback<Uri> uploadMsg) {
                openFileChooser(uploadMsg, "*/*", "");
            }
        });

        // Puente nativo expuesto a JavaScript
        webView.addJavascriptInterface(new WebAppInterface(this), "CanaimaFlixNative");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILECHOOSER_RESULTCODE) {
            if (mUploadMessage == null) return;
            Uri result = (data == null || resultCode != RESULT_OK) ? null : data.getData();
            mUploadMessage.onReceiveValue(result);
            mUploadMessage = null;
        }
    }

    private void installTlsSupport() {
        try {
            SSLContext sslContext = SSLContext.getInstance("TLSv1.2");
            sslContext.init(null, null, null);
            HttpsURLConnection.setDefaultSSLSocketFactory(new Tls12SocketFactory(sslContext.getSocketFactory()));
        } catch (Exception ignored) {
        }
    }

    private void notifyWebPlayerEvent(final String state, final String message) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (webView != null) {
                    String safeMsg = message.replace("\\", "\\\\").replace("'", "\\'");
                    webView.loadUrl("javascript:(window.onNativePlayerEvent && window.onNativePlayerEvent('" + state + "', '" + safeMsg + "'))");
                }
            }
        });
    }

    private void launchVlcExternal(String url, String title) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setPackage("org.videolan.vlc");
            intent.setDataAndType(Uri.parse(url), "video/*");
            intent.putExtra("title", title);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            try {
                Intent fallback = new Intent(Intent.ACTION_VIEW);
                fallback.setDataAndType(Uri.parse(url), "video/*");
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(fallback);
            } catch (Exception ex) {
                Toast.makeText(this, "Error al lanzar reproductor externo", Toast.LENGTH_SHORT).show();
            }
        }
    }

    private void setImmersiveMode() {
        if (Build.VERSION.SDK_INT >= 19) {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            );
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            setImmersiveMode();
        }
    }

    @Override
    public void onBackPressed() {
        if (nativePlayer != null && nativePlayer.isActive()) {
            nativePlayer.close();
            return;
        }
        if (customView != null) {
            // Salir de pantalla completa si está activa
            if (customViewContainer != null && customViewContainer.getVisibility() == View.VISIBLE) {
                customViewContainer.removeView(customView);
                customViewContainer.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);
                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                    customViewCallback = null;
                }
                customView = null;
                setImmersiveMode();
                return;
            }
        }
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (nativePlayer != null) {
            nativePlayer.pause();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (nativePlayer != null) {
            nativePlayer.resume();
        }
    }

    @Override
    protected void onDestroy() {
        if (nativePlayer != null) {
            nativePlayer.close();
        }
        super.onDestroy();
    }

    public class WebAppInterface {
        Context mContext;

        WebAppInterface(Context c) {
            mContext = c;
        }

        @JavascriptInterface
        public void playNative(final String streamUrl, final String title) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (nativePlayer != null) {
                        nativePlayer.play(streamUrl, title);
                    }
                }
            });
        }

        @JavascriptInterface
        public void stopNative() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (nativePlayer != null) {
                        nativePlayer.close();
                    }
                }
            });
        }

        @JavascriptInterface
        public void pauseNative() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (nativePlayer != null) {
                        nativePlayer.pause();
                    }
                }
            });
        }

        @JavascriptInterface
        public void resumeNative() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (nativePlayer != null) {
                        nativePlayer.resume();
                    }
                }
            });
        }

        @JavascriptInterface
        public boolean isNativePlayerSupported() {
            return true;
        }

        @JavascriptInterface
        public void launchVLC(String streamUrl, String title) {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setPackage("org.videolan.vlc");
                intent.setDataAndType(Uri.parse(streamUrl), "video/*");
                intent.putExtra("title", title);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                mContext.startActivity(intent);
            } catch (Exception e) {
                try {
                    Intent fallback = new Intent(Intent.ACTION_VIEW);
                    fallback.setDataAndType(Uri.parse(streamUrl), "video/*");
                    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    mContext.startActivity(fallback);
                } catch (Exception ex) {
                    Toast.makeText(mContext, "Error al lanzar VLC o reproductor", Toast.LENGTH_SHORT).show();
                }
            }
        }

        @JavascriptInterface
        public void showToast(String message) {
            Toast.makeText(mContext, message, Toast.LENGTH_SHORT).show();
        }

        @JavascriptInterface
        public boolean isVLCInstalled() {
            try {
                mContext.getPackageManager().getPackageInfo("org.videolan.vlc", 0);
                return true;
            } catch (PackageManager.NameNotFoundException e) {
                return false;
            }
        }

        /**
         * Escaneo rápido del almacenamiento de la tableta en búsqueda de archivos .m3u y .m3u8
         */
        @JavascriptInterface
        public String scanStorageForPlaylists() {
            JSONArray results = new JSONArray();
            try {
                List<File> roots = new ArrayList<File>();
                File extDir = Environment.getExternalStorageDirectory();
                if (extDir != null && extDir.exists()) roots.add(extDir);

                // Tarjeta SD externa o rutas habituales en KitKat
                File sdcard1 = new File("/storage/sdcard1");
                if (sdcard1.exists()) roots.add(sdcard1);
                File extsd = new File("/mnt/extsd");
                if (extsd.exists()) roots.add(extsd);

                for (File root : roots) {
                    scanDirectory(root, results, 0, 4);
                }
            } catch (Exception e) {
                // Registro silencioso para no romper flujo
            }
            return results.toString();
        }

        private void scanDirectory(File dir, JSONArray results, int currentDepth, int maxDepth) {
            if (dir == null || !dir.exists() || !dir.canRead() || currentDepth > maxDepth) return;
            File[] files = dir.listFiles();
            if (files == null) return;

            for (File f : files) {
                if (f.isDirectory()) {
                    String name = f.getName().toLowerCase();
                    // Omitir carpetas ocultas y del sistema
                    if (!name.startsWith(".") && !name.equals("android") && !name.equals("data")) {
                        scanDirectory(f, results, currentDepth + 1, maxDepth);
                    }
                } else {
                    String name = f.getName().toLowerCase();
                    if (name.endsWith(".m3u") || name.endsWith(".m3u8")) {
                        try {
                            JSONObject item = new JSONObject();
                            item.put("name", f.getName());
                            item.put("path", f.getAbsolutePath());
                            item.put("size", f.length());
                            item.put("sizeFormatted", formatFileSize(f.length()));
                            item.put("lastModified", f.lastModified());
                            results.put(item);
                        } catch (Exception ignored) {}
                    }
                }
            }
        }

        private String formatFileSize(long bytes) {
            if (bytes <= 0) return "0 B";
            if (bytes < 1024) return bytes + " B";
            if (bytes < 1024 * 1024) return String.format("%.1f KB", bytes / 1024.0);
            return String.format("%.1f MB", bytes / (1024.0 * 1024.0));
        }

        /**
         * Lee el contenido completo de un archivo de texto local (M3U/M3U8)
         */
        @JavascriptInterface
        public String readLocalTextFile(String filePath) {
            if (filePath == null || filePath.trim().isEmpty()) return "";
            StringBuilder sb = new StringBuilder();
            BufferedReader reader = null;
            try {
                File file = new File(filePath);
                if (!file.exists() || !file.canRead()) {
                    return "";
                }
                reader = new BufferedReader(new InputStreamReader(new FileInputStream(file), "UTF-8"));
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line).append("\n");
                }
            } catch (Exception e) {
                return "";
            } finally {
                if (reader != null) {
                    try { reader.close(); } catch (Exception ignored) {}
                }
            }
            return sb.toString();
        }
    }
}
