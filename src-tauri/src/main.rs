// En version publiée, pas de console Windows en plus de la fenêtre.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    cockpit_lib::run()
}
