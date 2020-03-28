import React, { useEffect, useState, useRef, useCallback } from 'react'
import { BrowserRouter, Route, useHistory, Switch } from 'react-router-dom'
import PropTypes from 'prop-types'
import { AnimatedSwitch } from 'react-router-transition'
import querystring from 'querystring'

const localMemory = {
  routes: {},
  authentication: null,
  params: {},
  envs: {}
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

async function isAuthenticated (callback) {
  try {
    const result = await getCallbackResult(localMemory.authFunc())
    callback(null, result)
  } catch (err) {
    callback(err)
  }
}

function RouteComponentContainerWrapper (props) {
  const isMounted = useMountedState()
  const [auth, setAuth] = useState(null)
  const { children, requiredAuth, redirect } = props
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
      isAuthenticated((err, result) => {
        if(!isMounted()){
          return
        }

        if (err) {
          return setAuth(false)
        }

        setAuth(result)
      })
    }
  }, [])

  useEffect(() => {
    if (auth === false) {
      const currentHref = window.location.href.split(window.location.host)[1]
      history.push(localMemory.notAuthPath + `?redirect=${currentHref}`)
    }
  }, [auth])

  if (!requiredAuth || auth === true) {
    if(redirect){
      return React.createElement(Redirect, {
        to: resolveEnvs(redirect)
      })
    }
    return children
  }

  return null
}

RouteComponentContainerWrapper.propTypes = {
  children: PropTypes.node,
  redirect: PropTypes.string,
  requiredAuth: PropTypes.bool
}

function isUndefinedThen (prop, value) {
  return prop === undefined ? value : prop
}

function RouteWithSubRoutes (props) {
  const {redirect, ...route} = props
  localMemory.params = route.computedMatch.params

  const render = routerProps => React.createElement(RouteComponentContainerWrapper, {
    requiredAuth: route.auth || false,
    children: redirect ? null : React.createElement(route.component, {...routerProps, ...route}),
    redirect,
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

function resolveEnvs(path){
  const match = path.match(/\$([.A-Za-z0-9_-]*)/g)

  if(match){
    match.map(param => {
      const key = param.replace('$', '')
      if (key in localMemory.envs) {
        path = path.replace(param, localMemory.envs[key])
      }
    })
  }

  return path
}

function viewGenerator (target, basePath, key, parents) {
  const view = bestCopyEver(target)

  if (view.path) {
    view.pathRegex = createPathRegex(basePath + target.path)

    view.getPath = function () {
      return resolveEnvs(basePath + target.path)
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

    view.pathRaw = view.path
    view.path = view.getPath
    view.append = view.appendPath
    view.params = view.setParams
    view.queryParams = view.setQueryParams
    view.options = view.preparePath
  }

  view.parents = parents

  if (!view.title) {
    view.title = key.charAt(0).toUpperCase() + key.slice(1)
  }

  return viewFormation(view)
}

export function setEnvs(envs){
  localMemory.envs = {
    ...localMemory.envs,
    ...envs
  }
}

export function getEnvs(){
  return localMemory.envs
}

function createPathRegex (path) {
  const reg = '([.A-Za-z0-9_-]*)'
  const afterBar = path === '/' ? '$' : '(\\/|)$'
  return path
      .replace(RegExp('/', 'g'), '\\/')
      .replace(RegExp('\\$' + reg, 'g'), reg)
      .replace(RegExp(':' + reg, 'g'), reg)
      + afterBar
}

function removeEnvs (path) {
  return path.replace(RegExp('\\$', 'g'),  ':')
}

function routeGenerator (target, basePath, parentAuth) {
  const route = bestCopyEver(target)

  if (route.path) {
    route.path = basePath + route.path
    route.pathRegex = createPathRegex(route.path)
    route.path = removeEnvs(route.path)
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

function handlerNotFound(target) {
  if('notFound' in target){
    const {notFound, ...other} = target

    return {
      ...other,
      notFound
    }
  }

  return target
}

export function handlerRoutes (targetRoutes, basePath = '', parentAuth = false, parents = []) {
  const routes = []
  const views = {}
  const viewsList = []

  const fixedTargets = handlerNotFound(targetRoutes)

  for (const key in fixedTargets) {
    const target = fixedTargets[key]
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
    tree: fixedTargets,
    viewsList,
    getCurrentView () {
      const currentView = viewsList.filter(view => {
        return RegExp(view.pathRegex).test(window.location.pathname)
      })

      return currentView ? currentView[0] : null
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
  const history = useHistory()

  function createResponse(group){
    if(!localMemory.routes[group]){
      throw Error(`Group "${group}" not exist in reutes.`)
    }

    const {views, ...other} = localMemory.routes[group]

    function goTo(target, action = 'push'){
      if(typeof target === 'function'){
        return history[action](target(views))
      } else if(target){
        return history[action](target)
      }

      return history
    }

    return {
      ...other,
      views,
      goTo,
      history
    }
  }

  if(!groupName){
    return createResponse
  }

  return createResponse(groupName)
}

export function useParams () {
  return localMemory.params
}

export function useEnvs () {
  return [getEnvs, setEnvs]
}

export function Routes (props) {
  const { group, routes, auth, authPath, ...other } = props

  if (auth) {
    setAuthenticator(auth, authPath)
  }

  if (routes) {
    const localRoutes = createRoutes(group, routes)
    return React.createElement(WrapperRouter, {
      ...localRoutes.routes[group],
      ...other
    })
  }

  const localRoutes = localMemory.routes[group]

  return React.createElement(WrapperRouter, {
    ...localRoutes,
    ...other
  })
}

Routes.propTypes = {
  group: PropTypes.string,
  routes: PropTypes.object,
  auth: PropTypes.func,
  authPath: PropTypes.string
}

