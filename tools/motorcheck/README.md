# Motorcheck

Writes a throwaway SignalRGB effect that reports which browser features the host
actually has. It paints one stripe per check into the preview (green = present,
red = missing) and logs the same to SignalRGB's own console.

    node tools/motorcheck/build.mjs "%USERPROFILE%\Documents\WhirlwindFX\Effects"

Select **ZZ 4 Motorcheck** in SignalRGB and open the Konsole.

Add a check here before any layer type starts relying on a browser feature.
Measured results live in `docs/erkenntnisse-signalrgb-motor.md` — this list has
already disproved two assumptions.
