import React, { useEffect, useState, useRef, useCallback } from 'react'
import { BrowserRouter, Route, useHistory, Switch } from 'react-router-dom'
import PropTypes from 'prop-types'
import { AnimatedSwitch } from 'react-router-transition'
import querystring from 'querystring'

const localMemory = {
  routes: {},
  authentication: null,
  params: {}
}

function useMountedState () {
  const mountedRef = useRef(false)
  const isMounted = useCallback(() => mountedRef.current, [mountedRef.current])

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
    }
  })

  return isMounted
}

function Redirect (props) {
  const { to } = props
  const history = useHistory()

  useEffect(() => {
    history.replace(to)
  }, [])

  return null
}

Redirect.propTypes = {
  to: PropTypes.string
}

function RouteComponentContainerWrapper (props) {
  const isMounted = useMountedState()
  const [auth, setAuth] = useState(null)
  const { children, requiredAuth } = props
  const history = useHistory()

  async function localAuth () {
    try {
      const result = await getCallbackResult(localMemory.authFunc())

      if (isMounted()) {
        setAuth(result)
      }
    } catch (err) {
      if (isMounted()) {
        setAuth(false)
      }
    }
  }

  useEffect(() => {
    if (requiredAuth) {
      localAuth()
    }
  }, [])

  useEffect(() => {
    if (auth === false) {
      const currentHref = window.location.href.split(window.location.host)[1]
      history.push(localMemory.notAuthPath + `?redirect=${currentHref}`)
    }
  }, [auth])

  if (!requiredAuth || auth === true) {
    return children
  }

  return null
}

RouteComponentContainerWrapper.propTypes = {
  children: PropTypes.node,
  requiredAuth: PropTypes.bool
}

function isUndefinedThen (prop, value) {
  return prop === undefined ? value : prop
}

function RouteWithSubRoutes (route) {
  localMemory.params = route.computedMatch.params

  if (route.redirect) {
    return React.createElement(Redirect, {
      to: route.redirect
    })
  }

  const render = routerProps => React.createElement(RouteComponentContainerWrapper, {
    requiredAuth: route.auth || false,
    children: React.createElement(route.component, {...routerProps, ...route}),
    ...route
  })

  const routeProps = {
    render
  }

  return React.createElement(Route, routeProps)
}

function bestCopyEver (src) {
  return Object.assign({}, src)
}

const pathUtils = {
  append (target, path, between = '/') {
    return target + between + path
  },
  setParams (target, params) {
    for (const param in params) {
      target = target.replace(RegExp(`:${param}`, 'g'), params[param])
    }

    return target
  },
  setQueries (target, queries) {
    return target + '?' + querystring.encode(queries)
  }
}

function viewGenerator (target, basePath, key, parents) {
  const view = bestCopyEver(target)

  if (view.path) {
    view.pathRegex = createPathRegex(basePath + target.path)

    view.getPath = function () {
      return basePath + view.path
    }

    view.appendPath = function (path, between = '/') {
      return pathUtils.append(view.getPath(), path, between)
    }

    view.setParams = function (params) {
      return pathUtils.setParams(view.getPath(), params)
    }

    view.setQueryParams = function (queries) {
      return pathUtils.setQueries(view.getPath(), queries)
    }

    view.handlerPath = function (options) {
      let path = view.getPath()

      if (options.params) {
        path = pathUtils.setParams(path, options.params)
      }

      if (options.append) {
        path = pathUtils.append(path, options.append)
      }

      if (options.queries) {
        path = pathUtils.setQueries(path, options.queries)
      }

      return path
    }
  }

  view.parents = parents

  if (!view.title) {
    view.title = key.charAt(0).toUpperCase() + key.slice(1)
  }

  return viewFormation(view)
}

function createPathRegex (path) {
  const reg = '([.A-Za-z0-9_-]*)'
  const afterBar = path === '/' ? '$' : '(\\/|)$'
  return path.replace(RegExp('/', 'g'), '\\/').replace(RegExp(':' + reg, 'g'), reg) + afterBar
}

function routeGenerator (target, basePath, parentAuth) {
  const route = bestCopyEver(target)

  if (route.path) {
    route.path = basePath + route.path
    route.pathRegex = createPathRegex(route.path)
  }

  if (route.auth === undefined) {
    route.auth = parentAuth
  }

  if (route.children) {
    delete route.children
  }

  return route
}

function resolveBasePath (path) {
  return path.slice(0, -1) + path[path.length - 1].replace('/', '')
}

export function handlerRoutes (targetRoutes, basePath = '', parentAuth = false, parents = []) {
  const routes = []
  const views = {}
  const viewsList = []

  for (const key in targetRoutes) {
    const target = targetRoutes[key]
    const route = routeGenerator(target, basePath, parentAuth)
    views[key] = viewGenerator(target, basePath, key, parents)

    routes.push(route)
    viewsList.push(views[key])

    if (target.children) {
      const children = handlerRoutes(target.children, resolveBasePath(route.path), route.auth, [...parents, views[key]])
      routes.push(...children.routes)
      viewsList.push(...children.viewsList)
      views[key].children = children.views
    }
  }

  return {
    routes,
    views,
    tree: targetRoutes,
    viewsList,
    getCurrentView () {
      const currentView = viewsList.filter(view => {
        return RegExp(view.pathRegex).test(window.location.pathname)
      })

      return currentView ? currentView[currentView.length - 1] : null
    }
  }
}

function viewFormation (target) {
  return new Proxy(target, {
    get: function (view, name) {
      if (!view[name] && view.children && view.children[name]) {
        return view.children[name]
      }

      return view[name]
    }
  })
}

function defaultReactRouterProps (route) {
  return {
    ...route,
    exact: isUndefinedThen(route.exact, true),
    sensitive: isUndefinedThen(route.sensitive, true),
    strict: isUndefinedThen(route.strict, false)
  }
}

export function WrapperRouter ({ routes, animate }) {
  const children = routes.map((route, key) => React.createElement(RouteWithSubRoutes, {
    key,
    ...defaultReactRouterProps(route)
  }))

  if (animate) {
    return React.createElement(AnimatedSwitch, {
      atEnter: { opacity: 0 },
      atLeave: { opacity: 0 },
      atActive: { opacity: 1 },
      className: 'switch-wrapper',
      children
    })
  }

  return React.createElement(Switch, {
    children
  })
}

WrapperRouter.defaultProps = {
  animate: false
}

WrapperRouter.propTypes = {
  routes: PropTypes.any,
  animate: PropTypes.bool
}

function getCallbackResult (obj) {
  return new Promise((resolve, reject) => {
    if (!!obj && (typeof obj === 'object' || typeof obj === 'function') && typeof obj.then === 'function') {
      obj.then(resolve).catch(reject)
    }

    resolve(obj)
  })
}

export * from 'react-router-dom'

export function setAuthenticator (funcOrPromise, notAuthPath) {
  localMemory.notAuthPath = notAuthPath
  localMemory.authFunc = funcOrPromise
}

export function createRoutes (groupName, routesParams) {
  const routes = handlerRoutes(routesParams)

  localMemory.routes[groupName] = routes

  return localMemory
}

export function useRoutes (groupName) {
  return localMemory.routes[groupName]
}

export function useParams () {
  return localMemory.params
}

export function Routes (props) {
  const { group, routes, ...other } = props

  const localRoutes = routes || localMemory.routes[group]

  return React.createElement(WrapperRouter, {
    ...localRoutes,
    ...other
  })
}

Routes.propTypes = {
  group: PropTypes.string,
  routes: PropTypes.object
}

