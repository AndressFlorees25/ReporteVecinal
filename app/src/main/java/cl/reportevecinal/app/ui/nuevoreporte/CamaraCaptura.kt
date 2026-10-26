package cl.reportevecinal.app.ui.nuevoreporte

import android.content.Context
import android.net.Uri
import android.util.Size
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.view.CameraController
import androidx.camera.view.LifecycleCameraController
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import java.io.File

/** Vista previa de la cámara trasera con un botón para tomar la foto (CameraX). */
@Composable
fun CamaraCaptura(
    onFotoTomada: (Uri) -> Unit,
    onError: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var capturando by remember { mutableStateOf(false) }

    val controller = remember {
        LifecycleCameraController(context).apply {
            setEnabledUseCases(CameraController.IMAGE_CAPTURE)
            // Fotos de ~2 MP: suficiente para un reporte y livianas para subir con datos móviles.
            imageCaptureResolutionSelector = ResolutionSelector.Builder()
                .setResolutionStrategy(
                    ResolutionStrategy(Size(1600, 1200), ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER)
                )
                .build()
            imageCaptureMode = ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY
        }
    }
    DisposableEffect(lifecycleOwner) {
        controller.bindToLifecycle(lifecycleOwner)
        onDispose { controller.unbind() }
    }

    Box(modifier) {
        AndroidView(
            factory = { ctx ->
                PreviewView(ctx).apply {
                    scaleType = PreviewView.ScaleType.FILL_CENTER
                    this.controller = controller
                }
            },
            modifier = Modifier.matchParentSize(),
        )
        FilledIconButton(
            onClick = {
                capturando = true
                tomarFoto(context, controller,
                    onListo = { capturando = false; onFotoTomada(it) },
                    onError = { capturando = false; onError(it) },
                )
            },
            enabled = !capturando,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(16.dp)
                .size(64.dp),
        ) {
            if (capturando) {
                CircularProgressIndicator(Modifier.size(28.dp), strokeWidth = 3.dp)
            } else {
                Icon(Icons.Filled.PhotoCamera, contentDescription = "Tomar foto", modifier = Modifier.size(32.dp))
            }
        }
    }
}

private fun tomarFoto(
    context: Context,
    controller: LifecycleCameraController,
    onListo: (Uri) -> Unit,
    onError: (String) -> Unit,
) {
    val carpeta = File(context.cacheDir, "fotos").apply { mkdirs() }
    // Se borran fotos anteriores que quedaron en caché (ya fueron subidas o descartadas).
    carpeta.listFiles()?.forEach { it.delete() }
    val archivo = File(carpeta, "reporte_${System.currentTimeMillis()}.jpg")

    controller.takePicture(
        ImageCapture.OutputFileOptions.Builder(archivo).build(),
        ContextCompat.getMainExecutor(context),
        object : ImageCapture.OnImageSavedCallback {
            override fun onImageSaved(resultado: ImageCapture.OutputFileResults) {
                onListo(resultado.savedUri ?: Uri.fromFile(archivo))
            }

            override fun onError(e: ImageCaptureException) {
                onError("No se pudo tomar la foto: ${e.localizedMessage}")
            }
        },
    )
}
