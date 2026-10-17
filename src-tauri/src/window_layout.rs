use tauri::{PhysicalPosition, PhysicalSize, WebviewWindow};

// Limit the outer window, including the platform's non-client frame, to the work area.
fn fitted_outer_size(work_width: u32, work_height: u32, scale: f64) -> PhysicalSize<u32> {
    PhysicalSize::new(
        ((1280.0 * scale).round() as u32)
            .min((work_width as f64 * 0.92).floor() as u32)
            .max(1),
        ((760.0 * scale).round() as u32)
            .min((work_height as f64 * 0.88).floor() as u32)
            .max(1),
    )
}

pub fn fit_main_window(window: &WebviewWindow) -> tauri::Result<()> {
    if let Some(monitor) = window.current_monitor()?.or(window.primary_monitor()?) {
        let work = monitor.work_area();
        let scale = monitor.scale_factor();
        let target = fitted_outer_size(work.size.width, work.size.height, scale);
        let outer = window.outer_size()?;
        let inner = window.inner_size()?;
        let size = PhysicalSize::new(
            target
                .width
                .saturating_sub(outer.width.saturating_sub(inner.width))
                .max(1),
            target
                .height
                .saturating_sub(outer.height.saturating_sub(inner.height))
                .max(1),
        );
        window.set_min_size(Some(PhysicalSize::new(
            ((700.0 * scale).round() as u32).min(size.width),
            ((440.0 * scale).round() as u32).min(size.height),
        )))?;
        window.set_size(size)?;
        window.set_position(PhysicalPosition::new(
            work.position.x + ((work.size.width - target.width) / 2) as i32,
            work.position.y + ((work.size.height - target.height) / 2) as i32,
        ))?;
    }
    Ok(())
}

pub fn ensure_visible(window: &WebviewWindow) -> tauri::Result<()> {
    if window.is_maximized()? || window.is_minimized()? {
        return Ok(());
    }
    if let Some(monitor) = window.current_monitor()?.or(window.primary_monitor()?) {
        let work = monitor.work_area();
        let size = window.outer_size()?;
        let position = window.outer_position()?;
        let margin = (12.0 * monitor.scale_factor()).round() as i32;
        if size.width as i64 > work.size.width as i64 - 2 * margin as i64
            || size.height as i64 > work.size.height as i64 - 2 * margin as i64
        {
            return fit_main_window(window);
        }
        let x = position.x.clamp(
            work.position.x + margin,
            work.position.x + work.size.width as i32 - size.width as i32 - margin,
        );
        let y = position.y.clamp(
            work.position.y + margin,
            work.position.y + work.size.height as i32 - size.height as i32 - margin,
        );
        if x != position.x || y != position.y {
            window.set_position(PhysicalPosition::new(x, y))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn leaves_work_area_margins_at_125_percent() {
        assert_eq!(
            fitted_outer_size(1920, 1020, 1.25),
            PhysicalSize::new(1600, 897)
        );
    }

    #[test]
    fn respects_work_area_on_small_high_dpi_and_large_monitors() {
        assert_eq!(
            fitted_outer_size(1920, 1020, 2.0),
            PhysicalSize::new(1766, 897)
        );
        assert_eq!(
            fitted_outer_size(1366, 728, 1.0),
            PhysicalSize::new(1256, 640)
        );
        assert_eq!(
            fitted_outer_size(3840, 2100, 1.5),
            PhysicalSize::new(1920, 1140)
        );
    }
}
