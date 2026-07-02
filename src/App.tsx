import { Routes, Route } from "react-router-dom";

import AppLayout from "./components/AppLayout";

import Dashboard from "./pages/Dashboard";
import MaterialMaster from "./pages/MaterialMaster";
import LocationMaster from "./pages/LocationMaster";
import MaterialAllocation from "./pages/MaterialAllocation";
import Reports from "./pages/Reports";
import ImportExport from "./pages/ImportExport";
import Settings from "./pages/Settings";

export default function App() {
  return (
      <Routes>
            <Route path="/" element={<AppLayout />}>

                    <Route index element={<Dashboard />} />

                            <Route
                                      path="materials"
                                                element={<MaterialMaster />}
                                                        />

                                                                <Route
                                                                          path="locations"
                                                                                    element={<LocationMaster />}
                                                                                            />

                                                                                                    <Route
                                                                                                              path="allocation"
                                                                                                                        element={<MaterialAllocation />}
                                                                                                                                />

                                                                                                                                        <Route
                                                                                                                                                  path="reports"
                                                                                                                                                            element={<Reports />}
                                                                                                                                                                    />

                                                                                                                                                                            <Route
                                                                                                                                                                                      path="import-export"
                                                                                                                                                                                                element={<ImportExport />}
                                                                                                                                                                                                        />

                                                                                                                                                                                                                <Route
                                                                                                                                                                                                                          path="settings"
                                                                                                                                                                                                                                    element={<Settings />}
                                                                                                                                                                                                                                            />

                                                                                                                                                                                                                                                  </Route>
                                                                                                                                                                                                                                                      </Routes>
                                                                                                                                                                                                                                                        );
                                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                                        