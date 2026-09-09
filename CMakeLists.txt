cmake_minimum_required(VERSION 3.16)
project(AAAGunner LANGUAGES CXX)
if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "Build with Emscripten: ./build.sh")
endif()
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXECUTABLE_SUFFIX ".js")
add_executable(physics
  engine/src/bindings.cpp
  engine/src/ballistics/simulator.cpp
  engine/src/ballistics/trajectory.cpp
  engine/src/physics/atmosphere.cpp
)
target_include_directories(physics PRIVATE engine/include)
target_compile_options(physics PRIVATE -Wall -Wextra -Wpedantic -Werror -O3 -ffast-math)
target_link_libraries(physics PRIVATE embind)
target_link_options(physics PRIVATE
  -O3 -sALLOW_MEMORY_GROWTH=1 -sMODULARIZE=1 -sEXPORT_ES6=1
  -sEXPORT_NAME=createPhysics -sSINGLE_FILE=1 -sDISABLE_EXCEPTION_CATCHING=0
)
