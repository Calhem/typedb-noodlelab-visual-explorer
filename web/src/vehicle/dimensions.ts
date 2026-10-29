// Overall proportions of the vehicle, in metres. Similar in size and stance to a premium mid-size SUV;
// the shape itself is original and unbranded.
//
// Coordinates: x points forward, y points up, z points to the vehicle's right.
// The origin is on the ground, midway between the axles, on the centre line.

export const WHEELBASE = 2.874;
export const FRONT_AXLE_X = WHEELBASE / 2;
export const REAR_AXLE_X = -WHEELBASE / 2;
export const TRACK_HALF = 0.815; // centre of each tyre, measured from the centre line
export const WHEEL_RADIUS = 0.405; // tyre outer radius: 265/40 R22
export const RIM_RADIUS = 0.2794; // 22-inch rim
export const TYRE_WIDTH = 0.265;
export const AXLE_Y = WHEEL_RADIUS; // wheels sit on the ground

export const NOSE_X = 2.34;
export const TAIL_X = -2.41;

/** Right-hand drive (UK). Driver sits on the right (+z). */
export const DRIVER_Z = 0.37;
