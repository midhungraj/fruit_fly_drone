"""
Drosophila Connectome-Inspired SNN Architecture (PyTorch)

Models the key neural circuits involved in fruit-fly visual pursuit and attack dive:
1. Ommatidia / Visual Spatial Field (Azimuth, Elevation, Looming rate)
2. Lobula Columnar 10 (LC10) Population: Small-object pursuit & azimuth correction
3. Lobula Columnar 4 (LC4) Population: Looming-sensitive attack strike trigger
4. Optomotor / Vertical System (VS): Altitude stability & ground clearance
5. Descending Premotor Neurons (DNa02 / DNp01): Motor flight commands
"""

import math
import torch
import torch.nn as nn
from .lif_neuron import LIFLayer

class DrosophilaBrain(nn.Module):
    def __init__(self):
        super().__init__()
        # Input features:
        # [azimuth, elevation, distance, looming_rate, altitude_error, drone_speed]
        self.input_dim = 6

        # Neural populations (LIF layers)
        self.lc10_layer = LIFLayer(in_features=self.input_dim, out_features=16, tau_m=0.03)
        self.lc4_layer = LIFLayer(in_features=self.input_dim, out_features=8, tau_m=0.02)
        self.optomotor_layer = LIFLayer(in_features=self.input_dim, out_features=8, tau_m=0.04)

        # Descending motor readout layer (forward, lateral, vertical, yaw)
        self.descending = nn.Linear(16 + 8 + 8, 4)

        self._init_connectome_weights()

    def _init_connectome_weights(self):
        with torch.no_grad():
            # LC10 is strongly driven by target azimuth
            self.lc10_layer.weight.zero_()
            for i in range(8):
                self.lc10_layer.weight[i, 0] = -2.5  # Left LC10 excited by negative azimuth
            for i in range(8, 16):
                self.lc10_layer.weight[i, 0] = 2.5   # Right LC10 excited by positive azimuth

            # LC4 is excited by optical looming and close range
            self.lc4_layer.weight.zero_()
            self.lc4_layer.weight[:, 3] = 4.0        # Looming rate drive
            self.lc4_layer.weight[:, 2] = -0.15      # Close distance drive

            # Optomotor is driven by altitude error
            self.optomotor_layer.weight.zero_()
            self.optomotor_layer.weight[:, 4] = 2.0  # Altitude error

    def reset(self):
        self.lc10_layer.reset_state()
        self.lc4_layer.reset_state()
        self.optomotor_layer.reset_state()

    def forward(self, features: torch.Tensor, dt: float = 0.016) -> dict:
        """
        Processes sensory features through Drosophila SNN and outputs motor commands.
        """
        lc10_spikes, lc10_v = self.lc10_layer(features, dt)
        lc4_spikes, lc4_v = self.lc4_layer(features, dt)
        opt_spikes, opt_v = self.optomotor_layer(features, dt)

        # Combined neural state vector
        combined_spikes = torch.cat([lc10_spikes, lc4_spikes, opt_spikes], dim=-1)

        # Motor commands (normalized -1 to 1)
        raw_motor = self.descending(combined_spikes)

        # Azimuth alignment modulation
        azimuth = float(features[0].item())
        alignment = max(0.0, math.cos(azimuth))

        # LC10 differential -> yaw steering
        left_lc10_act = lc10_spikes[:8].sum().item()
        right_lc10_act = lc10_spikes[8:].sum().item()
        yaw = float(math.tanh((right_lc10_act - left_lc10_act) * 0.4 + azimuth * 1.5))

        # LC4 attack dive -> forward thrust boost
        lc4_act = lc4_spikes.sum().item()
        if alignment > 0.2:
            base_fwd = 0.4 + alignment * 0.6
            if lc4_act > 0:
                base_fwd = 1.0
        else:
            base_fwd = 0.05  # pivot saccade on spot

        forward = float(torch.clamp(torch.tensor(base_fwd), -1.0, 1.0).item())
        lateral = float(torch.clamp(raw_motor[1], -0.4, 0.4).item())
        vertical = float(torch.clamp(raw_motor[2] + features[4] * 0.35, -1.0, 1.0).item())

        return {
            "action": {
                "forward": forward,
                "lateral": lateral,
                "vertical": vertical,
                "yaw": yaw,
            },
            "telemetry": {
                "lc10_spikes": int(lc10_spikes.sum().item()),
                "lc4_spikes": int(lc4_spikes.sum().item()),
                "opt_spikes": int(opt_spikes.sum().item()),
                "v_lc10_mean": float(lc10_v.mean().item()),
                "v_lc4_mean": float(lc4_v.mean().item()),
            }
        }
