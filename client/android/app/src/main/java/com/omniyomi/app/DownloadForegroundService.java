package com.omniyomi.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

public class DownloadForegroundService extends Service {

    private static final String CHANNEL_ID = "OmniYomi_Download_Channel";
    private static final int NOTIFICATION_ID = 1001;
    // FOREGROUND_SERVICE_TYPE_DATA_SYNC value (added in API 29)
    private static final int FOREGROUND_SERVICE_TYPE_DATA_SYNC = 4;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(@NonNull Intent intent, int flags, int startId) {
        String title = intent != null ? intent.getStringExtra("title") : "Baixando capítulo";
        String progress = intent != null ? intent.getStringExtra("progress") : "Iniciando...";

        Notification notification = buildNotification(title, progress);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // API 29+ (Android 10) supports foreground service types
            try {
                startForeground(NOTIFICATION_ID, notification, FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } catch (NoSuchMethodError | NoSuchFieldError e) {
                // Fallback if constant not available
                startForeground(NOTIFICATION_ID, notification);
            }
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        return START_STICKY;
    }

    public void updateProgress(String title, String progress) {
        Notification notification = buildNotification(title, progress);
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, notification);
        }
    }

    public void completeDownload(String title, boolean success) {
        Notification notification = buildNotification(
            title,
            success ? "Download concluído" : "Download falhou",
            true
        );
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, notification);
        }
        stopForeground(true);
        stopSelf();
    }

    private Notification buildNotification(String title, String progress, boolean completed) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? PendingIntent.FLAG_IMMUTABLE
                : 0
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(progress)
            .setSmallIcon(R.mipmap.ic_launcher_foreground)
            .setContentIntent(pendingIntent)
            .setAutoCancel(completed)
            .setOngoing(!completed)
            .setPriority(NotificationCompat.PRIORITY_LOW);
            // Category removed for compatibility - Notification.CATEGORY_DOWNLOAD requires API 21+

        if (completed) {
            builder.setProgress(0, 0, false);
        }

        return builder.build();
    }

    private Notification buildNotification(String title, String progress) {
        return buildNotification(title, progress, false);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Downloads OmniYomi",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Notificações de progresso de download de capítulos");
            channel.enableVibration(false);
            channel.setSound(null, null);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    @Nullable
    @Override
    public IBinder onBind(@NonNull Intent intent) {
        return null;
    }
}