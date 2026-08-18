cmake_minimum_required(VERSION 3.24)

project(orion_network_engine VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(orion_network_metrics src/metrics.cpp)
target_include_directories(orion_network_metrics PUBLIC include)

add_executable(orion-network-engine src/main.cpp)
target_link_libraries(orion-network-engine PRIVATE orion_network_metrics)

include(CTest)
if(BUILD_TESTING)
    add_executable(orion-network-engine-tests tests/metrics_test.cpp)
    target_link_libraries(orion-network-engine-tests PRIVATE orion_network_metrics)
    add_test(NAME network-metrics COMMAND orion-network-engine-tests)
endif()

if(MSVC)
    target_compile_options(orion_network_metrics PRIVATE /W4 /permissive-)
    target_compile_options(orion-network-engine PRIVATE /W4 /permissive-)
    if(BUILD_TESTING)
        target_compile_options(orion-network-engine-tests PRIVATE /W4 /permissive-)
    endif()
endif()
