"""
Leaky Integrate-and-Fire (LIF) Spiking Neuron Layer (PyTorch)
"""

import torch
import torch.nn as nn

class LIFLayer(nn.Module):
    def __init__(self, in_features: int, out_features: int, 
                 tau_m: float = 0.035, v_rest: float = -70.0, 
                 v_thresh: float = -50.0, v_reset: float = -75.0, 
                 r_m: float = 10.0):
        super().__init__()
        self.in_features = in_features
        self.out_features = out_features
        self.tau_m = tau_m
        self.v_rest = v_rest
        self.v_thresh = v_thresh
        self.v_reset = v_reset
        self.r_m = r_m

        # Synaptic weights
        self.weight = nn.Parameter(torch.randn(out_features, in_features) * 0.5)
        self.bias = nn.Parameter(torch.zeros(out_features))

        # Membrane potential state
        self.register_buffer("v_m", torch.full((out_features,), v_rest))

    def reset_state(self):
        self.v_m.fill_(self.v_rest)

    def forward(self, x: torch.Tensor, dt: float) -> tuple[torch.Tensor, torch.Tensor]:
        """
        Euler integration of LIF membrane potential:
        tau_m * dV/dt = -(V - V_rest) + R * I_syn
        """
        # Synaptic current
        i_syn = torch.matmul(x, self.weight.t()) + self.bias

        # Voltage update
        dv = (-(self.v_m - self.v_rest) + self.r_m * i_syn) / self.tau_m
        self.v_m = self.v_m + dv * dt

        # Spike generation
        spikes = (self.v_m >= self.v_thresh).float()

        # Reset upon spike
        self.v_m = torch.where(spikes > 0, torch.full_like(self.v_m, self.v_reset), self.v_m)

        return spikes, self.v_m
