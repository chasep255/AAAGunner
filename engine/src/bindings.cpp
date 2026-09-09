#include "ballistics/simulator.h"
#include <emscripten/bind.h>

using namespace emscripten;
using namespace btk::ballistics;
using namespace btk::math;
using namespace btk::physics;

// Expose only the flight objects used by the game.
EMSCRIPTEN_BINDINGS(aaagunner_physics)
{
  class_<Vector3D>("Vector3D")
    .constructor<float, float, float>()
    .property("x", &Vector3D::x)
    .property("y", &Vector3D::y)
    .property("z", &Vector3D::z);
  enum_<DragFunction>("DragFunction").value("G1", DragFunction::G1).value("G7", DragFunction::G7);
  class_<Bullet>("Bullet")
    .constructor<float, float, float, float, DragFunction>()
    .constructor<const Bullet&, const Vector3D&, const Vector3D&, float>()
    .function("getPosition", &Bullet::getPosition);
  class_<Atmosphere>("Atmosphere").constructor<>();
  class_<Trajectory>("Trajectory")
    .function("getPointCount", &Trajectory::getPointCount)
    .function("clear", &Trajectory::clear);
  class_<Simulator>("BallisticsSimulator")
    .constructor<>()
    .function("setInitialBullet", &Simulator::setInitialBullet)
    .function("setAtmosphere", &Simulator::setAtmosphere)
    .function("getCurrentBullet", &Simulator::getCurrentBullet)
    .function("simulate", &Simulator::simulate)
    .function("getTrajectory", select_overload<Trajectory&()>(&Simulator::getTrajectory), return_value_policy::reference());
}
