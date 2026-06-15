class CoordinateAdapter:
    def __init__(self, recorded_width, recorded_height):
        self.recorded_width = recorded_width
        self.recorded_height = recorded_height

    def adapt(self, x, y, current_width, current_height):
        if current_width == self.recorded_width and current_height == self.recorded_height:
            return x, y
        scale_x = current_width / self.recorded_width
        scale_y = current_height / self.recorded_height
        return round(x * scale_x), round(y * scale_y)