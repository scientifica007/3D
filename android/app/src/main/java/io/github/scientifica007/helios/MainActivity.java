package io.github.scientifica007.helios;

import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

public final class MainActivity extends Activity {
    private static final String ENTRY = "file:///android_asset/index.html";
    private WebView web;
    private FrameLayout root;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED);
        getWindow().setStatusBarColor(Color.rgb(6, 11, 20));
        getWindow().setNavigationBarColor(Color.rgb(6, 11, 20));
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(6,11,20));
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(6,11,20));
        WebSettings cfg = web.getSettings();
        cfg.setJavaScriptEnabled(true);
        cfg.setDomStorageEnabled(true);
        cfg.setAllowFileAccess(true);
        cfg.setAllowContentAccess(false);
        cfg.setAllowFileAccessFromFileURLs(false);
        cfg.setAllowUniversalAccessFromFileURLs(false);
        cfg.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        cfg.setBlockNetworkLoads(true);
        cfg.setMediaPlaybackRequiresUserGesture(true);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !ENTRY.equals(request.getUrl().toString());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return !ENTRY.equals(url);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullscreenView != null) { callback.onCustomViewHidden(); return; }
                fullscreenView=view; fullscreenCallback=callback;
                web.setVisibility(View.GONE);
                root.addView(view,new FrameLayout.LayoutParams(-1,-1));
                getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
                    View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
            }
            @Override public void onHideCustomView() { closeFullscreen(); }
        });
        root.addView(web,new FrameLayout.LayoutParams(-1,-1));
        if (Build.VERSION.SDK_INT >= 35) {
            root.setOnApplyWindowInsetsListener((v,insets)->{
                android.graphics.Insets bars=insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
                if(fullscreenView==null) v.setPadding(bars.left,bars.top,bars.right,bars.bottom);
                else v.setPadding(0,0,0,0);
                return insets;
            });
        }
        setContentView(root);
        web.loadUrl(ENTRY);
    }
    private void closeFullscreen() {
        if(fullscreenView==null) return;
        root.removeView(fullscreenView); fullscreenView=null;
        web.setVisibility(View.VISIBLE);
        getWindow().getDecorView().setSystemUiVisibility(0);
        root.requestApplyInsets();
        if(fullscreenCallback!=null){fullscreenCallback.onCustomViewHidden();fullscreenCallback=null;}
    }
    @Override public void onBackPressed() {
        if(fullscreenView!=null){closeFullscreen();return;}
        super.onBackPressed();
    }
    @Override protected void onPause() { if(web!=null) web.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if(web!=null) web.onResume(); }
    @Override protected void onDestroy() {
        closeFullscreen();
        if(web!=null){root.removeView(web);web.stopLoading();web.destroy();web=null;}
        super.onDestroy();
    }
}
