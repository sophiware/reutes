import React from 'react'
import { Route, Redirect } from 'react-router-dom'
import PropTypes from 'prop-types'
import { AnimatedSwitch } from 'react-router-transition'
import querystring from 'querystring'
const localMemory = {}

function RouteComponentContainerWrapper (props) {
  const auth = true
  const { children, requiredAuth } = props

  if (!requiredAuth) {
    return children
  }

  if (auth === true) {
    return children
  }

  return React.createElement(Redirect, {
    to: `/login?redirect=${window.location.href.split(window.location.host)[1]}`
  })
}

RouteComponentContainerWrapper.propTypes = {
  children: PropTypes.node,
  requiredAuth: PropTypes.bool
}

function RouteWithSubRoutes (route) {
  if (route.redirect) {
    return React.createElement(Route, {
      exact: route.exact === undefined ? true : route.exact,
      path: route.path,
      render: () => React.createElement(Redirect, {
        to: route.redirect
      })
    })
  }

  if (!route.path) {
    return React.createElement(Route, {
      component: route.component
    })
  }

  const render = routerProps => {
    const props = route.props ? { ...route.props, ...routerProps } : routerProps

    const Component = route.component

    return React.createElement(RouteComponentContainerWrapper, {
      requiredAuth: route.auth || false,
      children: React.createElement(Component, props)
    })
  }

  return React.createElement(Route, {
    exact: route.exact,
    sensitive: route.sensitive,
    strict: route.strict,
    path: route.path,
    render
  })
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
  const reg = '([.A-Za-z0-9_-]*)'
  const view = bestCopyEver(target)

  if (view.path) {
    view.pathRegex = basePath + view.path.replace(RegExp(':' + reg, 'g'), reg) + '$'

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

function routeGenerator (target, basePath) {
  const reg = '([.A-Za-z0-9_-]*)'
  const route = bestCopyEver(target)

  if (route.path) {
    route.path = basePath + route.path
    route.pathRegex = basePath + route.path.replace(RegExp(':' + reg, 'g'), reg) + '$'
  }

  if (route.children) {
    delete route.children
  }

  return route
}

function resolveBasePath (path) {
  return path[path.length - 1].replace('/', '')
}

export function handlerRoutes (targetRoutes, basePath = '', parents = []) {
  const routes = []
  const views = {}
  const viewsList = []

  for (const key in targetRoutes) {
    const target = targetRoutes[key]
    const route = routeGenerator(target, basePath)
    views[key] = viewGenerator(target, basePath, key, parents)

    routes.push(route)
    viewsList.push(views[key])

    if (target.children) {
      const children = handlerRoutes(target.children, resolveBasePath(route.path), [...parents, views[key]])
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
        console.log(view.pathRegex, window.location.pathname)
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

export function WrapperRouter ({ routes, animate }) {
  return animate ? React.createElement(AnimatedSwitch, {
    atEnter: { opacity: 0 },
    atLeave: { opacity: 0 },
    atActive: { opacity: 1 },
    className: 'switch-wrapper',
    children: routes.map((route, i) => React.createElement(RouteWithSubRoutes, {
      key: i,
      ...route
    }))
  }) : React.createElement(React.Fragment, {
    children: routes.map((route, i) => React.createElement(RouteWithSubRoutes, {
      key: i,
      ...route
    }))
  })
}

WrapperRouter.defaultProps = {
  animate: false
}

WrapperRouter.propTypes = {
  routes: PropTypes.any,
  animate: PropTypes.bool
}

export function createRoutes (groupName, routesParams) {
  const routes = handlerRoutes(routesParams)

  localMemory[groupName] = routes

  return localMemory
}

export function Uiarum (props) {
  const { group, ...other } = props

  const routes = localMemory[group]
  console.log(routes)

  return React.createElement(WrapperRouter, {
    ...routes,
    ...other
  })
}

Uiarum.propTypes = {
  group: PropTypes.string
}

export * from 'react-router-dom'
