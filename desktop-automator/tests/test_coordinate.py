from lib.coordinate_adapter import CoordinateAdapter

def test_same_resolution_no_scaling():
    adapter = CoordinateAdapter(recorded_width=1920, recorded_height=1080)
    x, y = adapter.adapt(960, 540, 1920, 1080)
    assert x == 960 and y == 540

def test_scale_down():
    adapter = CoordinateAdapter(recorded_width=1920, recorded_height=1080)
    x, y = adapter.adapt(960, 540, 1280, 720)
    assert x == 640 and y == 360

def test_scale_up():
    adapter = CoordinateAdapter(recorded_width=1280, recorded_height=720)
    x, y = adapter.adapt(640, 360, 1920, 1080)
    assert x == 960 and y == 540