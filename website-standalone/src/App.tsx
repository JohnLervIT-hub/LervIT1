import { Route, Switch } from 'wouter'
import LandingPage from './pages/LandingPage'
import BecomeAMover from './pages/BecomeAMover'

function App() {
  return (
    <Switch>
      <Route path="/become-a-mover" component={BecomeAMover} />
      <Route component={LandingPage} />
    </Switch>
  )
}

export default App
