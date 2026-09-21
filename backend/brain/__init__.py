"""
NeuroDrone Drosophila Connectome Brain Package (PyTorch SNN)

Exposes:
- LIFLayer: Leaky Integrate-and-Fire spiking neural layer with membrane dynamics
- DrosophilaBrain: Connectome model combining LC10 (pursuit), LC4 (looming attack),
  and Optomotor (altitude stability) circuits
"""

from .lif_neuron import LIFLayer
from .drosophila_snn import DrosophilaBrain

__all__ = ["LIFLayer", "DrosophilaBrain"]
