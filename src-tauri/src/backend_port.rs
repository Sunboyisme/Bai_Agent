use std::{io, net::TcpListener};

/// Keep a free port reserved until the backend is ready to spawn.
pub struct BackendPort {
    pub port: u16,
    reservation: Option<TcpListener>,
}

impl BackendPort {
    pub fn needs_spawn(&self) -> bool {
        self.reservation.is_some()
    }

    pub fn release(&mut self) {
        self.reservation.take();
    }
}

pub fn select_backend_port(
    preferred: u16,
    same_profile: impl FnOnce(u16) -> bool,
) -> io::Result<BackendPort> {
    let listener = match TcpListener::bind(("127.0.0.1", preferred)) {
        Ok(listener) => listener,
        Err(error)
            if matches!(
                error.kind(),
                io::ErrorKind::AddrInUse | io::ErrorKind::PermissionDenied
            ) =>
        {
            if same_profile(preferred) {
                return Ok(BackendPort {
                    port: preferred,
                    reservation: None,
                });
            }
            TcpListener::bind(("127.0.0.1", 0))?
        }
        Err(error) => return Err(error),
    };
    Ok(BackendPort {
        port: listener.local_addr()?.port(),
        reservation: Some(listener),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn free_port_is_reserved_for_the_child() {
        let mut selected = select_backend_port(0, |_| panic!("No service to reuse")).unwrap();
        assert!(selected.needs_spawn());
        assert!(TcpListener::bind(("127.0.0.1", selected.port)).is_err());
        selected.release();
        assert!(TcpListener::bind(("127.0.0.1", selected.port)).is_ok());
    }

    #[test]
    fn foreign_service_gets_another_port_without_disturbing_it() {
        let foreign = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let occupied = foreign.local_addr().unwrap().port();
        let selected = select_backend_port(occupied, |_| false).unwrap();
        assert_ne!(selected.port, occupied);
        assert!(selected.needs_spawn());
        assert!(TcpListener::bind(("127.0.0.1", occupied)).is_err());
    }

    #[test]
    fn authenticated_same_profile_service_is_reused() {
        let existing = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let occupied = existing.local_addr().unwrap().port();
        let selected = select_backend_port(occupied, |port| port == occupied).unwrap();
        assert_eq!(selected.port, occupied);
        assert!(!selected.needs_spawn());
    }
}
